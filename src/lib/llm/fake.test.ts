import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import {
  createFixtureLlm,
  FixtureMissingError,
  FixtureSchemaError,
  failingLlm,
  stubLlm,
} from "./fake";
import { hashPrompt, type LlmFixture } from "./port";

const TimelineSchema = z.object({
  events: z.array(
    z.object({
      year: z.number().int().positive(),
      event: z.string().min(1),
    })
  ),
});

const PROMPT = "Simulate a shared life for Ana and Luis.";

const fixture: LlmFixture = {
  id: "timeline.canonical-events",
  promptHash: hashPrompt(PROMPT),
  response: {
    events: [
      { year: 2, event: "You move to Manhattan" },
      { year: 6, event: "The kid" },
    ],
  },
  recordedAt: "2026-08-22T00:00:00.000Z",
};

describe("createFixtureLlm", () => {
  it("replays a recorded response, validated against the schema", async () => {
    const llm = createFixtureLlm([fixture]);

    const result = await llm.generate({
      id: "timeline.canonical-events",
      prompt: PROMPT,
      schema: TimelineSchema,
    });

    expect(result.events).toHaveLength(2);
    expect(result.events[0]).toEqual({
      year: 2,
      event: "You move to Manhattan",
    });
  });

  it("names the available fixtures when one is missing", async () => {
    const llm = createFixtureLlm([fixture]);

    await expect(
      llm.generate({
        id: "timeline.does-not-exist",
        prompt: PROMPT,
        schema: TimelineSchema,
      })
    ).rejects.toThrow(FixtureMissingError);

    // The error has to be actionable -- a bare "not found" sends someone
    // grepping. It should say what IS there.
    try {
      await llm.generate({
        id: "timeline.does-not-exist",
        prompt: PROMPT,
        schema: TimelineSchema,
      });
    } catch (error) {
      expect((error as Error).message).toContain("timeline.canonical-events");
      expect((error as Error).message).toContain("fixtures:record");
    }
  });

  it("fails loudly when a fixture no longer matches its schema", async () => {
    // This is the whole point of validating on replay. Without it, a schema
    // change leaves fixtures silently describing a shape the engine no longer
    // accepts, and the suite stays green while production breaks.
    const stricter = z.object({
      events: z.array(
        z.object({
          year: z.number().int().positive(),
          event: z.string().min(1),
          // Added after the fixture was recorded.
          dimensions: z.object({ openness: z.number() }),
        })
      ),
    });

    const llm = createFixtureLlm([fixture]);

    await expect(
      llm.generate({
        id: "timeline.canonical-events",
        prompt: PROMPT,
        schema: stricter,
      })
    ).rejects.toThrow(FixtureSchemaError);
  });

  it("warns when the live prompt has drifted from the recording", async () => {
    const warn = vi.fn();
    const llm = createFixtureLlm([fixture], { warn });

    await llm.generate({
      id: "timeline.canonical-events",
      prompt: "A completely reworded prompt.",
      schema: TimelineSchema,
    });

    expect(warn).toHaveBeenCalledOnce();
    expect(warn.mock.calls[0][0]).toContain("recorded against a different");
  });

  it("does not warn when the prompt is unchanged", async () => {
    const warn = vi.fn();
    const llm = createFixtureLlm([fixture], { warn });

    await llm.generate({
      id: "timeline.canonical-events",
      prompt: PROMPT,
      schema: TimelineSchema,
    });

    expect(warn).not.toHaveBeenCalled();
  });

  it("can be made strict about prompt drift", async () => {
    const llm = createFixtureLlm([fixture], { onPromptDrift: "throw" });

    await expect(
      llm.generate({
        id: "timeline.canonical-events",
        prompt: "Reworded.",
        schema: TimelineSchema,
      })
    ).rejects.toThrow(/different prompt/);
  });

  it("can ignore prompt drift while prompts are being iterated", async () => {
    const warn = vi.fn();
    const llm = createFixtureLlm([fixture], {
      onPromptDrift: "ignore",
      warn,
    });

    const result = await llm.generate({
      id: "timeline.canonical-events",
      prompt: "Reworded.",
      schema: TimelineSchema,
    });

    expect(warn).not.toHaveBeenCalled();
    expect(result.events).toHaveLength(2);
  });
});

describe("stubLlm", () => {
  it("returns hand-written responses by id", async () => {
    const llm = stubLlm({
      "timeline.canonical-events": { events: [] },
    });

    const result = await llm.generate({
      id: "timeline.canonical-events",
      prompt: "anything",
      schema: TimelineSchema,
    });

    // The empty case matters: a room of one person, or a pair the engine
    // cannot find any coherent events for.
    expect(result.events).toEqual([]);
  });

  it("validates stubs too, so a malformed stub fails the test", async () => {
    const llm = stubLlm({
      "timeline.canonical-events": { events: [{ year: -1, event: "" }] },
    });

    await expect(
      llm.generate({
        id: "timeline.canonical-events",
        prompt: "anything",
        schema: TimelineSchema,
      })
    ).rejects.toThrow(FixtureSchemaError);
  });

  it("supports a function for dynamic responses", async () => {
    const llm = stubLlm((id) =>
      id === "timeline.canonical-events"
        ? { events: [{ year: 1, event: "generated" }] }
        : undefined
    );

    const result = await llm.generate({
      id: "timeline.canonical-events",
      prompt: "anything",
      schema: TimelineSchema,
    });

    expect(result.events[0].event).toBe("generated");
  });
});

describe("failingLlm", () => {
  it("rejects, so callers can be tested against model outages", async () => {
    const llm = failingLlm(new Error("rate limited"));

    await expect(
      llm.generate({ id: "any", prompt: "p", schema: TimelineSchema })
    ).rejects.toThrow("rate limited");
  });
});

describe("hashPrompt", () => {
  it("is stable for the same input", () => {
    expect(hashPrompt(PROMPT)).toBe(hashPrompt(PROMPT));
  });

  it("differs for different input", () => {
    expect(hashPrompt(PROMPT)).not.toBe(hashPrompt(`${PROMPT} `));
  });
});
