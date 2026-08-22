/**
 * The photo storage port (docs/domain.md D11), owned by the core.
 *
 * Photos go to Neon Object Storage in production (D11 as amended by #25;
 * `docs/storage.md`) and to the fake `data:` adapter in tests and in a local
 * checkout without `AWS_ENDPOINT_URL_S3`; the use case knows neither. `src/lib/composition.ts` decides which adapter implements
 * this, and nothing under `src/lib/{domain,use-cases,ports}` may import one.
 */
import type { ParticipantId } from "../domain/participant";

export interface PhotoUpload {
  /** Namespaces the object (`photos/<participantId>`) -- never the URL itself. */
  participantId: ParticipantId;
  bytes: Uint8Array;
  /** Already checked against the server ceiling by the use case. */
  contentType: string;
}

export interface StoredPhoto {
  /** Unguessable and publicly readable (D11); saved as `participants.photo_url`. */
  url: string;
}

export interface PhotoStore {
  put(upload: PhotoUpload): Promise<StoredPhoto>;
}
