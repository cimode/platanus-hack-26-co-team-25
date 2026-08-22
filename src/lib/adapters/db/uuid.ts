/**
 * The one place that knows the ids in this schema are Postgres `uuid` columns.
 *
 * Postgres does not miss on a malformed uuid, it errors: `invalid input syntax
 * for type uuid`. So a lookup that promises `T | null` has to refuse the string
 * before it reaches the driver, or a stale `hookai_session` cookie becomes a
 * 500 on every screen instead of the unknown-session path to `/intake`.
 *
 * It lives in the adapter because the shape of the column is the adapter's
 * business: `ParticipantId`, `RoomId` and `SessionToken` are opaque strings to
 * the domain, and they stay that way (docs/architecture.md).
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** True when Postgres would accept `value` as a `uuid` literal. */
export function isUuid(value: string): boolean {
  return UUID.test(value);
}
