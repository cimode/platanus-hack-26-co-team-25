import type { LlmPort } from "../../ports/llm";
import type { TimelinePort } from "../../ports/timeline";
import { scoreParticipant } from "../../use-cases/score-participant";
import { simulatePair } from "../../use-cases/simulate-pair";
import type { Db } from "../db/client";
import { createGeneratedBlockRepository } from "../db/generated-block-repository";
import { createLatentRepository } from "../db/latent-repository";
import { createParticipantRepository } from "../db/participant-repository";
import { createResponseRepository } from "../db/response-repository";
import { createRoomRepository } from "../db/room-repository";
import { createTimelineNarrator } from "./narrator";

/**
 * Production adapter for `TimelinePort`: ranks through Postgres, generates
 * through the domain engine, narrates through `LlmPort`.
 */
export function createDbTimelines(db: Db, llm: LlmPort): TimelinePort {
  const latents = createLatentRepository(db);
  const responses = createResponseRepository(db);
  const generatedBlocks = createGeneratedBlockRepository(db);
  const narrator = createTimelineNarrator(llm);

  const deps = {
    participants: createParticipantRepository(db),
    latents,
    responses,
    rooms: createRoomRepository(db),
    scoreParticipant: (input: Parameters<typeof scoreParticipant>[0]) =>
      scoreParticipant(input, {
        responses,
        generatedBlocks,
        latents,
        now: () => new Date(),
      }),
    narrator,
  };

  return {
    simulate: (input) => simulatePair(input, deps),
  };
}
