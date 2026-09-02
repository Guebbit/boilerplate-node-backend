# db/migrations/20260901230000-orders-detach-orphaned-userid.js

## Purpose

One-time backfill that detaches `userId` from orders orphaned by account hard-deletes that occurred **before** the `orders` collection gained its own `USER_DELETED` detach handler. For every order whose `userId` no longer resolves to a live user, it unsets `userId` and stamps `anonymizeAfter` 10 years out — replicating what the runtime handler now does automatically. The order row (the invoice) is preserved.

## Key elements

- **`RETENTION_DAYS`** (3650) — Hardcoded literal; deliberately not read from the `NODE_ORDER_PII_RETENTION_DAYS` env var so the migration's behaviour is fixed at deploy time.
- **`up(db)`** — Collects all live user `_id`s via `distinct`, then runs a single `updateMany` on `orders` matching `{ userId: { $exists: true, $nin: liveUserIds } }` to `$unset userId` and `$set anonymizeAfter`. Idempotent: already-detached orders won't match a second run.
- **`down()`** — Intentionally throws. The orphaned `userId` values are unrecoverable by design; rolling back is impossible.

## Relationships

No files are registered as graph neighbours. Logically the migration mirrors the semantics of `detachUserId` in `orders/service.ts` (unset + `anonymizeAfter` stamp) and references the `NODE_ORDER_PII_RETENTION_DAYS` variable, but it does not import or call either at runtime.

## Notes

- **Not reversible.** If the retention window was set wrong, the documented remedy is to correct the env var and let the reaper handle future erasures — do not attempt a down-migration.
- The 3650-day constant is intentionally a literal. Reading the env var at migration time would make the outcome depend on *when* the migration happens to run, which is undesirable for a one-shot script.
- The filter `$nin: liveUserIds` means the migration is **safe to re-run** after new users are created; it will only affect orders whose `userId` still points at a missing user.
