# Object storage

Participant photos live in **Neon Object Storage** — S3-compatible buckets that branch
with the database (`docs/domain.md` D11, amended 2026-08-22 by
[#25](https://github.com/platanus-hack/platanus-hack-26-co-team-25/issues/25)).

## Why, in one paragraph

The photo is part of the floor: no photo, no ranking. Vercel Blob was D11's original
choice and it failed silently — `BLOB_READ_WRITE_TOKEN` was never set on Vercel, so
production fell through to the fake `data:` adapter and every uploaded photo died with
the invocation. Neon Object Storage removes the second provider entirely: the same
project, the same branch, the same credential system as Postgres. A preview or CI branch
gets its own copy-on-write bucket, so the rows and the files they reference can never
drift apart across environments. It is a public beta and runs only in `us-east-2` —
which is where this project already is.

## The bucket

One bucket, `photos`, declared in `neon.ts` at the repo root:

```ts
export default defineConfig({
  preview: { buckets: { photos: { access: "public_read" } } },
});
```

`public_read` is deliberate. The URL is stored in `participants.photo_url` and rendered
with a plain `<img src>`, so it must be fetchable with no credential and no signature —
which is exactly the exposure model D11 already accepted for Blob. Writes are still
authenticated; only reads are anonymous. What makes that safe is the key:

```
photos/<participantId>/<32 random hex>.jpg
```

128 bits of randomness per object, minted in `photoObjectKey()`. A URL never follows
from a participant id, and a fresh key per upload means a re-upload never overwrites the
object the row currently points at. No object is ever presigned — a signed URL would
put `X-Amz-Signature` and the access key id into a page and into every log that page
touches, and `neon-object-storage-photo-store.test.ts` (AC-4) fails the build if any
adapter under `src/lib/adapters/storage/` grows one.

## Provisioning a branch

Buckets are branch-scoped. On a branch that already exists (a worktree's `dev-*`
branch, `ci-base`, `production`):

```bash
npx neon deploy              # alias of `neon config apply`; creates the declared buckets
npx neon env pull            # writes the branch's AWS_* vars to disk
npx neon bucket list         # photos  public_read
```

`neon checkout` applies `neon.ts` as it *creates* a branch, so a fresh preview/CI branch
comes up with `photos` already there. Checking out an **existing** branch does not
reconcile it — run `neon deploy` after changing `neon.ts`.

`env pull` writes `.env.local` when there is no `.env`. This repo's convention is
`.env` (drizzle-kit reads only that one — `docs/database.md`), so if it produces
`.env.local`, move the four `AWS_*` lines into `.env` and delete it. Never commit
`.env`, `.env.local` or `.neon`.

## The four variables

AWS-standard names, so `@aws-sdk/client-s3` picks all of them up from the environment
with no configuration beyond `forcePathStyle: true` (Neon is path-style only):

| Variable | Meaning |
| --- | --- |
| `AWS_ACCESS_KEY_ID` | branch credential's token id (`nak_live_…`) |
| `AWS_SECRET_ACCESS_KEY` | branch credential's secret (`nsk_live_…`) |
| `AWS_ENDPOINT_URL_S3` | `https://br-<branch>.storage.c-4.us-east-2.aws.neon.tech` |
| `AWS_REGION` | `us-east-2` |

Credentials are branch-scoped and valid for that branch **and all its descendants**.

`AWS_ENDPOINT_URL_S3` is the single switch: `src/lib/composition.ts` hands out the Neon
adapter when it is set and the fake `data:` store when it is not, and
`src/lib/adapters/storage/test-storage.ts` skips the storage integration tests on the
same variable (loudly, under `STORAGE_REQUIRED=1`). That is why Playwright uploads nothing:
`e2e/` runs with no endpoint.

## Vercel

The four variables have to be set per environment, from the matching branch's
credentials — Neon does not inject them into a Vercel build:

| Vercel environment | Pull from |
| --- | --- |
| Production | `neon env pull --branch production --file .env.production` |
| Preview | `neon env pull --branch ci-base --file .env.preview` |

Then paste the four values into Vercel → Settings → Environment Variables under the
matching environment (or `vercel env add AWS_ENDPOINT_URL_S3 production`, four times).
Until Production carries them, production falls back to the fake store — the exact
failure #25 fixes, so check `neon bucket object list photos --branch production` after
the first real upload rather than trusting the deploy.

One-time, after this merges:

```bash
npx neon deploy --branch production   # creates the bucket on production
npx neon deploy --branch ci-base      # and on the CI parent
```

## CI (owned by [#5](https://github.com/platanus-hack/platanus-hack-26-co-team-25/issues/5))

Per-PR branches are created from `ci-base` and **inherit its buckets on creation**, so
`ci.yml` needs no storage step today. Two things it must add when it next changes:

- `neon deploy --branch preview/pr-<n>` (with `NEON_API_KEY`) whenever `neon.ts` itself
  changes — inheritance happens at branch creation, not at every push.
- the branch's four `AWS_*` variables in the `unit` job's environment if the storage
  integration tests are to run there; without them they skip, and `STORAGE_REQUIRED=1` turns
  that skip into a failure. Decide one or the other deliberately — a green `unit` job
  that skipped every upload test is what this whole issue is about.

## Debugging

```bash
npx neon bucket object list photos            # what is actually in the branch bucket
npx neon logs query --source storage --since 1h
```

A failed write raises `PutObject into the photos bucket failed for key …` — the SDK's
own `SignatureDoesNotMatch` names neither the bucket nor the operation, which in a log
is indistinguishable from any other misconfigured branch service.

## Not built

- **Private bucket + presigned URLs.** It would need a `urlFor(key)` on the `PhotoStore`
  port and a change at every render site, to buy an expiry over an already-unguessable
  URL. Recorded as the stricter alternative; `public_read` is what D11 chose.
- **Deleting the object on withdrawal.** Still in `docs/domain.md` §9's not-in-this-split
  list.

> `DB_REQUIRED=1` (what CI sets) does **not** cover storage on purpose: the per-PR Neon branch has a migrated database but no provisioned bucket, so the storage integration tests skip there with a notice. Set `STORAGE_REQUIRED=1` only where `neon deploy` ran and the `AWS_*` credentials are present.
