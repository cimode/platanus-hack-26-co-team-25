/**
 * Timeline narration over `LlmPort` (issue #33).
 *
 * Preserves the three properties PR #17 established:
 *   1. Response shape stated in words in every prompt.
 *   2. Per-beat parallelism with bounded concurrency.
 *   3. Per-beat failure isolation — a failed beat takes deterministic fallback
 *      prose; the timeline still ships.
 *
 * Model chain and gateway auth live in `adapters/llm/gateway.ts`; this module
 * only knows `LlmPort.generate`.
 */

import { z } from "zod";

import { emoteForLifeEvent } from "../../domain/emotes/actions";
import {
  playableByAll,
  REACTION_EMOTES,
  type ReactionEmote,
} from "../../domain/emotes/emotes";
import type { Lens, PairScore, Person } from "../../domain/matching/engine";
import {
  mockNarrateBeat,
  mockNominate,
} from "../../domain/timeline/mock-narrator";
import type {
  Beat,
  NarrateResult,
  NominateResult,
  TimelineNarrator,
} from "../../domain/timeline/shared";
import {
  applyDelta,
  initialState,
  scanBanned,
  scanSurvivalClaims,
} from "../../domain/timeline/shared";
import type { LlmPort } from "../../ports/llm";

export const BEAT_TIMEOUT_MS = 45_000;
export const NOMINATE_TIMEOUT_MS = 25_000;
export const DEFAULT_NARRATE_CONCURRENCY = 6;
export const MAX_SENTENCE_CHARS = 400;

const SAFETY_RULES = [
  "Warm, concrete, specific. Third person, present tense. One to two sentences per event.",
  "NEVER include: ultimatums or demands framed as threats; judging either person's character or morals; third parties entering the romance; health scares, loss of life, or medical storylines; any intoxicant; religious references; political references; shaming anyone about money; naming psychology constructs or conflict-communication constructs (describe behavior concretely instead).",
  "Never state numeric chances, percentages, or how likely the relationship is to last.",
  "Only reference places, kids, pets, or jobs that earlier events in the list established.",
].join("\n");

const PET_WORD_RE = /\b(dogs?|cats?|pupp(?:y|ies)|pups?|kittens?|pets?)\b/i;

/**
 * What each reaction reads as on screen, in the model's own vocabulary.
 *
 * Stated in words rather than left to the emote's name: "walk" alone invites a
 * departure, when the sheet is a few steps that end back on the mark. The list
 * is generated from REACTION_EMOTES so a newly packed one-shot cannot be
 * offered without a description (the `satisfies` below fails to compile).
 */
const EMOTE_MEANINGS = {
  celebrate: "cheering, arms up — a win, an arrival, something worth marking",
  wave: "a small warm greeting or acknowledgement — low-key, everyday",
  cry: "quiet grief or disappointment",
  walk: "a few steps and back on the mark — going somewhere, a change of place",
  angry: "frustrated, arms crossed — friction that has not become a fight",
  fight: "a real clash, squaring off — a collision of wills",
  defeat: "shoulders down, giving in — a loss",
  love: "hearts, smitten — tenderness, closeness, a new arrival in the family",
} satisfies Record<ReactionEmote, string>;

const EMOTE_RULES = [
  "Also choose the reaction BOTH avatars play while this event is on screen, from exactly this list:",
  ...REACTION_EMOTES.map((emote) => `  ${emote} — ${EMOTE_MEANINGS[emote]}`),
  "Pick the one that fits what happens in THIS event, not the mood of the whole story. When nothing fits well, prefer the plainest honest option over a dramatic one.",
].join("\n");

function personFacts(label: string, p: Person): string {
  const ls = p.declared.lifeShape;
  return [
    `${label}: ${p.name}`,
    `  tags: ${p.declared.tags.join(", ") || "(none)"}`,
    `  chronotype band: ${p.declared.chronotype} (0 early … 3 late)`,
    `  life shape — money posture ${ls.moneyPosture}, rootedness ${ls.rootedness}, family gravity ${ls.familyGravity}, capacity hours band ${ls.capacityHoursBand}`,
  ].join("\n");
}

function scoreFacts(score: PairScore): string {
  const drivers = score.drivers.map((d) => `${d.term} (${d.label})`).join(", ");
  const friction = score.friction
    ? `${score.friction.term} (${score.friction.label})`
    : "none";
  const flags =
    Object.entries(score.flags)
      .map(([k]) => k)
      .join(", ") || "none";
  return `band: ${score.band} · top drivers: ${drivers || "none"} · friction term: ${friction} · flags: ${flags}`;
}

interface StateInventory {
  locations: string[];
  kids: string[];
  pets: string[];
  jobs: string[];
  venture: string | null;
}

function buildInventory(beats: readonly Beat[]): StateInventory {
  let s = initialState();
  const locations = [s.location];
  const jobs = [s.jobs.a];
  for (const beat of beats) {
    s = applyDelta(s, beat.delta, beat.year);
    if (!locations.includes(s.location)) locations.push(s.location);
    for (const j of [s.jobs.a, s.jobs.b]) if (!jobs.includes(j)) jobs.push(j);
  }
  return {
    locations,
    kids: s.kids,
    pets: s.pets,
    jobs,
    venture: s.venture,
  };
}

function establishedFactsPerBeat(beats: readonly Beat[]): string[] {
  let s = initialState();
  return beats.map((beat) => {
    s = applyDelta(s, beat.delta, beat.year);
    return [
      `location: ${s.location}`,
      `kids: ${s.kids.join(", ") || "none"}`,
      `pets: ${s.pets.join(", ") || "none"}`,
      s.venture !== null ? `venture: ${s.venture}` : null,
    ]
      .filter((x) => x !== null)
      .join(" · ");
  });
}

function buildNarrationContext(
  beats: readonly Beat[],
  a: Person,
  b: Person,
  lens: Lens
): {
  inventory: StateInventory;
  beatOutline: string;
  perBeat: string[];
  preamble: string[];
} {
  const inventory = buildInventory(beats);
  const perBeat = establishedFactsPerBeat(beats);
  const beatOutline = beats
    .map((bt, i) => `${i + 1}. year ${bt.year} · ${bt.kind} · ${bt.hint}`)
    .join("\n");
  const inventoryBlock = [
    "ESTABLISHED STATE inventory (the complete cast of this story):",
    `  locations: ${inventory.locations.join(", ")}`,
    `  kids: ${inventory.kids.join(", ") || "none"}`,
    `  pets: ${inventory.pets.join(", ") || "none"}`,
    `  jobs: ${inventory.jobs.join(", ")}`,
    `  venture: ${inventory.venture ?? "none"}`,
    'HARD RULE: no person, pet, or place may appear in any sentence unless it is in this inventory or in the beat list below. If pets is "none", no animal lives with them and none may be mentioned.',
    "HARD RULE: never invent a name. Children and pets are referred to exactly as this inventory words them; the only names you may write are the two people's own.",
  ].join("\n");
  const preamble = [
    `You are narrating a simulated shared ${lens} timeline between two real people. The structure is fixed; you only write the prose.`,
    personFacts("Person A", a),
    personFacts("Person B", b),
    inventoryBlock,
  ];
  return { inventory, beatOutline, perBeat, preamble };
}

function validateSentenceText(
  raw: unknown
): { ok: true; text: string } | { ok: false; reason: string } {
  const text = String(raw ?? "").trim();
  if (text.length === 0) return { ok: false, reason: "empty sentence text" };
  if (text.length > MAX_SENTENCE_CHARS)
    return { ok: false, reason: "sentence over length cap" };
  if (scanBanned(text).length > 0)
    return { ok: false, reason: "banned content in a sentence" };
  if (scanSurvivalClaims(text).length > 0)
    return { ok: false, reason: "survival claim in a sentence" };
  return { ok: true, text };
}

function resolveConcurrency(): number {
  const raw = (process.env.TIMELINE_CONCURRENCY ?? "").trim();
  if (raw === "") return DEFAULT_NARRATE_CONCURRENCY;
  const n = Number(raw);
  if (!Number.isFinite(n) || Number.isNaN(n))
    return DEFAULT_NARRATE_CONCURRENCY;
  return n <= 0 ? Number.POSITIVE_INFINITY : Math.floor(n);
}

async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  task: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const out = new Array<R>(items.length);
  let cursor = 0;
  const worker = async (): Promise<void> => {
    for (;;) {
      const i = cursor++;
      if (i >= items.length) return;
      out[i] = await task(items[i], i);
    }
  };
  const workers = Math.max(1, Math.min(items.length, limit));
  await Promise.all(Array.from({ length: workers }, worker));
  return out;
}

function beatRequestId(index: number): string {
  return `timeline.narrate.beat.${index}`;
}

/**
 * An `LlmPort`-backed narrator. Per-beat calls use ids
 * `timeline.narrate.beat.{index}`; nomination uses `timeline.nominate`.
 */
export function createTimelineNarrator(llm: LlmPort): TimelineNarrator {
  // Two keys, not one. `z.enum` is what makes the vocabulary a hard constraint
  // rather than a request: `generateObject` re-asks the model until it answers
  // inside the list, so nothing downstream ever parses free text for an emote.
  const beatSchema = z.object({
    text: z.string(),
    emote: z.enum(REACTION_EMOTES),
  });

  return {
    async narrate(beats, persons, lens, opts): Promise<NarrateResult> {
      const [a, b] = persons;
      const mockAll = (): string[] =>
        beats.map((beat, i) => mockNarrateBeat(beat, a, b, opts.seed, i));
      const mockEmotes = (): ReactionEmote[] =>
        beats.map((beat) => emoteForLifeEvent(beat.kind));

      if (beats.length === 0) {
        return { texts: [], emotes: [], narration: "mock" };
      }

      const { inventory, beatOutline, perBeat, preamble } =
        buildNarrationContext(beats, a, b, lens);
      const grounding =
        "Ground each sentence in the two people's tags and declared facts where natural, and only within the established state above.";

      const narrateOne = async (
        beat: Beat,
        i: number
      ): Promise<{
        text: string;
        emote: ReactionEmote;
        live: boolean;
        petGuarded: boolean;
        emoteFallback: boolean;
      }> => {
        const mockText = (): string =>
          mockNarrateBeat(beat, a, b, opts.seed, i);
        const mockEmote = emoteForLifeEvent(beat.kind);
        const prompt = [
          ...preamble,
          `Below is the COMPLETE ordered outline of this timeline, for continuity. You are writing beat ${i + 1} ONLY.`,
          beatOutline,
          `State established by the end of beat ${i + 1} — ${perBeat[i]}.`,
          `Write beat ${i + 1} — year ${beat.year}, ${beat.kind}, what happens: ${beat.hint}. One or two sentences, under 300 characters. Do not narrate any other beat and do not number your answer.`,
          EMOTE_RULES,
          'Respond with a JSON object having exactly two keys: "text", the sentence and nothing else, and "emote", one value from the list above.',
          grounding,
          SAFETY_RULES,
        ].join("\n\n");

        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            const result = await llm.generate({
              id: beatRequestId(i),
              prompt,
              schema: beatSchema,
              note: `timeline beat ${i + 1}/${beats.length}`,
            });
            const v = validateSentenceText(result.text);
            if (!v.ok) continue;
            // `z.enum` already guarantees the value is one of the eight, so what
            // is left to check is physical: does BOTH avatars' sheet exist. With
            // no plates named there is nothing to check against, and rejecting
            // every choice would quietly turn the model off.
            const plates = [opts.avatarA, opts.avatarB].filter(
              (plate): plate is string => typeof plate === "string"
            );
            const playable =
              plates.length === 0 || playableByAll(plates, result.emote);
            const emote = playable ? result.emote : mockEmote;
            const emoteFallback = !playable;
            if (inventory.pets.length === 0 && PET_WORD_RE.test(v.text)) {
              const text = mockText();
              try {
                opts.onSentence?.(i, text);
              } catch {
                /* renderer must not break narration */
              }
              return {
                text,
                emote,
                emoteFallback,
                live: true,
                petGuarded: true,
              };
            }
            try {
              opts.onSentence?.(i, v.text);
            } catch {
              /* renderer must not break narration */
            }
            return {
              text: v.text,
              emote,
              emoteFallback,
              live: true,
              petGuarded: false,
            };
          } catch {
            /* retry once, then mock this beat */
          }
        }
        const text = mockText();
        try {
          opts.onSentence?.(i, text);
        } catch {
          /* renderer must not break narration */
        }
        // The whole beat failed, so the emote is not a rejected CHOICE -- it is
        // part of the same mock fallback the prose took. Not counted twice.
        return {
          text,
          emote: mockEmote,
          emoteFallback: false,
          live: false,
          petGuarded: false,
        };
      };

      const limit = resolveConcurrency();
      const settled = await mapWithConcurrency(beats, limit, narrateOne);
      const mockFallbacks = settled.filter((r) => !r.live).length;
      const liveCount = settled.length - mockFallbacks;
      const petGuardReplacements = settled.filter((r) => r.petGuarded).length;
      const emoteFallbacks = settled.filter((r) => r.emoteFallback).length;

      if (liveCount === 0) {
        return { texts: mockAll(), emotes: mockEmotes(), narration: "mock" };
      }

      return {
        texts: settled.map((r) => r.text),
        emotes: settled.map((r) => r.emote),
        narration: "live",
        ...(emoteFallbacks > 0 ? { emoteFallbacks } : {}),
        ...(petGuardReplacements > 0 ? { petGuardReplacements } : {}),
        ...(mockFallbacks > 0 ? { mockFallbacks } : {}),
      };
    },

    async nominate(a, b, score, lens, grammar, opts): Promise<NominateResult> {
      if (
        grammar.patterns.length === 0 ||
        grammar.domains.length === 0 ||
        grammar.outcomes.length === 0
      ) {
        return mockNominate(a, b, score, lens, grammar, opts);
      }

      const asEnum = (xs: readonly string[]) =>
        z.enum(xs as [string, ...string[]]);
      const schema = z.object({
        pattern: asEnum(grammar.patterns),
        domain: asEnum(grammar.domains),
        outcome: asEnum(grammar.outcomes),
        triggerClaim: z.string().min(3).max(60),
      });

      const prompt = [
        `Propose ONE bonus story arc for a simulated ${lens} timeline between these two people, chosen from a fixed grammar.`,
        personFacts("Person A", a),
        personFacts("Person B", b),
        `Their pair score: ${scoreFacts(score)}`,
        `Pick exactly one pattern from [${grammar.patterns.join(", ")}], one domain from [${grammar.domains.join(", ")}], one outcome from [${grammar.outcomes.join(", ")}].`,
        'triggerClaim must name the score component that justifies the arc, formatted "driver:<term>", "friction:<term>", or "flag:<flagName>" using the terms listed above. Your claim will be verified against the actual scores by code; unjustified arcs are rejected.',
        'Respond with a JSON object having exactly these four keys: "pattern", "domain", "outcome", "triggerClaim".',
        SAFETY_RULES,
      ].join("\n\n");

      try {
        const nomination = await llm.generate({
          id: "timeline.nominate",
          prompt,
          schema,
          note: "timeline bonus arc nomination",
        });
        return { nomination, narration: "live" };
      } catch {
        return mockNominate(a, b, score, lens, grammar, opts);
      }
    },
  };
}
