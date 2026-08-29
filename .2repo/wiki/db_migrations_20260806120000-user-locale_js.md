# db/migrations/20260806120000-user-locale.js

## Purpose

Backfills the `locale` field on existing `users` documents so that out-of-band consumers (queued emails, nightly jobs) have a value to read when no `Accept-Language` header is available. New users receive their locale at signup via `services/auth.ts`; this migration covers the population that registered before the field existed.

## Key elements

- **`DEFAULT_LOCALE`** — module-level constant; resolves to `process.env.NODE_DEFAULT_LOCALE` or falls back to `'en'`.
- **`up(db)`** — runs `updateMany` on the `users` collection, setting `locale` to `DEFAULT_LOCALE` only where the field does not yet exist (`$exists: false`).
- **`down(db)`** — runs `updateMany` on the `users` collection, `$unset`-ing `locale` entirely (restoring the pre-migration "no value" state rather than attempting to distinguish who had it and who didn't).

## Relationships

No graph neighbors are recorded for this file. The migration comments reference `services/auth.ts` as the code path that populates `locale` for new signups, but that file is not part of the dependency graph here.

## Notes

- **Idempotency by design.** The `$exists: false` filter means re-running `up` will not overwrite a locale a user has already chosen. `migrate-mongo status` tracks applied migrations, but this guard protects against manual re-runs.
- **Why a backfill is needed at all.** The Mongoose schema declares a default for `locale`, but schema defaults apply at write time, not read time. Documents already persisted before the schema change would otherwise return `undefined` indefinitely.
- **`down` is lossy.** It cannot restore the pre-migration mix of "has a value" vs. "absent"; it simply removes the field for everyone, relying on the schema default to reproduce the prior read-time behavior.
- **Environment coupling.** If `NODE_DEFAULT_LOCALE` changes between deployment and migration run, different users could receive different backfill values. The value is read once at module load.
