import { describe, it } from "vitest";

/**
 * `setPhoto` use case (issue #6): resolves the participant by session token,
 * enforces the server ceiling (image/jpeg | image/png | image/webp, <= 1 MiB),
 * stores the bytes through the PhotoStore port and saves the returned URL.
 *
 * Both tests use inline in-memory stubs for ParticipantRepository and
 * PhotoStore -- no adapter import, so the biome.json hexagon rule holds.
 */

describe("setPhoto", () => {
  // TODO: un-skip when setPhoto exists.
  // Blocked on: src/lib/use-cases/set-photo.ts, src/lib/ports/photo-store.ts
  // and ParticipantRepository (#4).
  it.skip("AC-3 · rejects a non-image, an oversized photo and an unknown session without touching the store", () => {});

  // TODO: un-skip when setPhoto exists.
  // Blocked on: src/lib/use-cases/set-photo.ts, src/lib/ports/photo-store.ts
  // and ParticipantRepository (#4).
  it.skip("AC-4 · stores the bytes once under the participant's id and saves the returned URL", () => {});
});
