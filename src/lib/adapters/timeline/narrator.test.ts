import { describe, expect, it } from "vitest";
import { emoteForLifeEvent } from "../../domain/emotes/actions";
import { isReactionEmote, REACTION_EMOTES } from "../../domain/emotes/emotes";
import type { Gender, Person } from "../../domain/matching/engine";
import type { Beat, TimelineOpts } from "../../domain/timeline/shared";
import type { LlmPort } from "../../ports/llm";
import { stubLlm } from "../llm/fake";
import { createTimelineNarrator } from "./narrator";

/**
 * The emote half of narration (the sentence half is covered through
 * `simulate-pair.test.ts`).
 *
 * The property under test is not "the model picks well" — it cannot be — but
 * that EVERY beat comes back with a reaction the pair's avatars can actually
 * play, whatever the model does: a good answer, a sheet one avatar lacks, a
 * refusal, or a dead gateway. A beat with no emote is an avatar frozen in the
 * middle of a timeline, so the fallback is the feature.
 */

function person(id: string, name: string, gender: Gender = "F"): Person {
  return {
    id,
    name,
    latents: {
      regulation: { mean: 0.6, se: 0.2 },
      politeness: { mean: 0.6, se: 0.2 },
      reliability: { mean: 0.6, se: 0.2 },
      agency: { mean: 0.5, se: 0.2 },
    },
    declared: {
      distanceBand: 1,
      lifeShape: {
        moneyPosture: 0.5,
        rootedness: 0.5,
        familyGravity: 0.5,
        capacityHoursBand: 2,
      },
      tags: ["ramen", "escalada"],
      chronotype: 1,
    },
    structural: { track: "sim", cohort: 1, acquaintances: [] },
    gates: {
      romantic: {
        interestedIn: ["M", "F", "NB"],
        gender,
        single: true,
        ageBand: 1,
        wantsKids: true,
      },
      business: { riskPosture: 1, exitHorizon: 1, redlinesOk: true },
    },
    consent: { romantic: true, business: true, friendship: true },
    hasPhoto: true,
  } as Person;
}

const ANA = person("ana", "Ana");
const BRUNO = person("bruno", "Bruno", "M");

/** One beat of each kind that a romantic timeline can actually produce. */
const BEATS: Beat[] = [
  { year: 1, kind: "milestone", domain: "ritual", hint: "se conocen" },
  { year: 3, kind: "conflict", domain: "home", hint: "chocan por la casa" },
  { year: 5, kind: "kid", domain: "kids", hint: "llega la guagua" },
  { year: 9, kind: "dissolution", domain: "home", hint: "se separan" },
];

const OPTS: TimelineOpts = {
  seed: 7,
  offspringConsentA: true,
  offspringConsentB: true,
};

const SENTENCE = "Una frase fija, concreta y sin nada prohibido.";

/** Answers every beat call with this emote; nomination falls back to the mock. */
function llmChoosing(emote: string): LlmPort {
  return stubLlm(() => ({ text: SENTENCE, emote }));
}

async function narrate(llm: LlmPort, opts: TimelineOpts = OPTS) {
  return createTimelineNarrator(llm).narrate(
    BEATS,
    [ANA, BRUNO],
    "romantic",
    opts
  );
}

describe("the narrator's emote choice", () => {
  it("returns one playable reaction per beat, aligned with the sentences", async () => {
    const result = await narrate(llmChoosing("celebrate"));

    expect(result.emotes).toHaveLength(BEATS.length);
    expect(result.texts).toHaveLength(result.emotes.length);
    for (const emote of result.emotes)
      expect(isReactionEmote(emote)).toBe(true);
  });

  it("uses the model's choice over the deterministic map", async () => {
    // `cry` is the map's answer for `epilogue` only, so on these four beats a
    // returned `cry` can only have come from the model.
    const result = await narrate(llmChoosing("cry"));

    expect(result.narration).toBe("live");
    expect(result.emotes).toEqual(["cry", "cry", "cry", "cry"]);
    expect(result.emotes[0]).not.toBe(emoteForLifeEvent(BEATS[0].kind));
    expect(result.emoteFallbacks).toBeUndefined();
  });

  it("accepts every emote in the published vocabulary", async () => {
    for (const emote of REACTION_EMOTES) {
      const result = await narrate(llmChoosing(emote));
      expect(result.emotes, emote).toEqual(BEATS.map(() => emote));
    }
  });

  it("refuses a locomotion loop and falls back to the map", async () => {
    // The schema is `z.enum(REACTION_EMOTES)`, so a walk cycle never validates:
    // the beat is retried, then takes its deterministic prose and emote. This is
    // the guard that keeps an avatar from walking off and never coming back.
    const result = await narrate(llmChoosing("walk-back"));

    expect(result.narration).toBe("mock");
    expect(result.emotes).toEqual(BEATS.map((b) => emoteForLifeEvent(b.kind)));
  });

  it("rejects an emote the pair's avatars cannot both play, and counts it", async () => {
    // avatar1 has every sheet; the second plate is not an authored avatar at
    // all, so `playableByAll` says no and the map answers instead.
    const result = await narrate(llmChoosing("celebrate"), {
      ...OPTS,
      avatarA: "avatar1",
      avatarB: "no-such-plate",
    });

    expect(result.emotes).toEqual(BEATS.map((b) => emoteForLifeEvent(b.kind)));
    expect(result.emoteFallbacks).toBe(BEATS.length);
    // The PROSE was still live: a rejected emote must not throw away the writing.
    expect(result.narration).toBe("live");
    expect(result.texts.every((t) => t === SENTENCE)).toBe(true);
  });

  it("keeps the model's choice when both plates really have the sheet", async () => {
    const result = await narrate(llmChoosing("love"), {
      ...OPTS,
      avatarA: "avatar1",
      avatarB: "avatar3",
    });

    expect(result.emotes).toEqual(BEATS.map(() => "love"));
    expect(result.emoteFallbacks).toBeUndefined();
  });

  it("skips verification rather than rejecting everything when no plate is named", async () => {
    // Structural tests and old rows have no avatar. Verifying against nothing
    // must not silently turn the model off.
    const result = await narrate(llmChoosing("angry"), {
      ...OPTS,
      avatarA: null,
      avatarB: null,
    });

    expect(result.emotes).toEqual(BEATS.map(() => "angry"));
  });

  it("still animates every beat when the gateway is dead", async () => {
    const dead: LlmPort = {
      generate: () => Promise.reject(new Error("gateway down")),
    };
    const result = await narrate(dead);

    expect(result.narration).toBe("mock");
    expect(result.emotes).toEqual(BEATS.map((b) => emoteForLifeEvent(b.kind)));
    // A whole-beat failure is counted as mock prose, not as a rejected choice.
    expect(result.emoteFallbacks).toBeUndefined();
  });

  it("animates an empty timeline without inventing beats", async () => {
    const result = await createTimelineNarrator(llmChoosing("wave")).narrate(
      [],
      [ANA, BRUNO],
      "romantic",
      OPTS
    );
    expect(result.emotes).toEqual([]);
    expect(result.texts).toEqual([]);
  });
});
