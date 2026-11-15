---
source: src/modules/users/services/remove.ts
sha256: 87c5d299de9d605ecf0d591af3d4cca7b78222840724caf01590c0b9b9779183
generated_at: 2026-11-14T22:31:10.172063+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/services/remove.ts

## Purpose

Implements the full user deletion and restoration lifecycle: soft delete (stamp `deletedAt`, revoke sessions), hard delete (transactional erasure cascade across all registered personal-data hooks), and undoing either form. It exists as the single implementation layer beneath the route handlers so that soft-delete, hard-delete, restore, and scheduled-purge-cancel all share one set of transaction and audit guarantees.

## Key elements

- **`remove(user, hardDelete?, context?)`** — Core entry. Soft path stamps `deletedAt`, calls `markSessionsEnded`, saves, records audit. Hard path delegates to `erase`. Idempotent on already-soft-deleted docs.
- **`erase(user, context?, claim?, erasedAt?)`** — Hard delete. Opens a transaction, optionally runs a `claim` predicate (to lose a race against a concurrent restore), then `runErasureCascade` → commit → `runAfterErase` → image removal → audit. Returns `false` only when a claim is lost.
- **`runErasureCascade(user, session, erasedAt?)`** *(private)* — Iterates `personalDataErasers()` **sequentially** within the session, collects `AfterErase` callbacks, anonymises hold-setters, deletes the user document, and enqueues a `USER_ERASED` outbox event.
- **`runAfterErase(userId, deferred)`** *(private)* — Fires deferred post-commit callbacks. Each is individually caught so one failure never skips the rest; the only signal is a log line.
- **`restoreById(id, context)`** — Undoes a soft delete. Routes to `restoreScheduled` when `deletedBy === 'owner'` (grace-period check + outbox `USER_DELETION_CANCELED`); otherwise clears `deletedAt`/`deletedBy` and saves.
- **`restoreScheduled(user, context)`** *(private)* — Conditional restore of an owner-requested deletion; returns 409 `USER_ERASURE_DUE` if grace has expired.
- **`removeById(id, hardDelete?, context)`** — Public-facing wrapper: resolves the document via `withClearedAccount` (staff-permission gate), then delegates to `remove`.

## Relationships

- **`src/infrastructure/runtime/database.ts`** — `withTransaction` wraps every hard-delete and scheduled-restore write so the cascade is atomic.
- **`src/infrastructure/http/response.ts`** — All public functions return `ResponseSuccess` / `ResponseReject` built via `generateSuccess` / `generateReject`.
- **`src/infrastructure/i18n/index.ts`** — `t()` localises the error messages returned in reject responses.
- **`src/infrastructure/i18n/context.ts`** — Provides the i18n context used for message resolution.
- **`src/infrastructure/observability/audit.ts`** — `recordAudit` writes a trail row on every soft delete, hard delete, and restore.
- **`src/infrastructure/adapters/image-store.ts`** — The image adapter is used post-commit during hard delete to remove the user's stored image.
- **`src/infrastructure/adapters/logger.ts`** — The logger is used in `runAfterErase` as the sole failure signal for post-commit steps.
- **`src/kernel/outbox.ts`** — `enqueueOutboxEvent` (third-party `USER_ERASED`), `announceInTransaction` (scheduled-cancel event), `nudgeOutbox` (flush after commit).
- **`src/kernel/registry.ts`** — `AfterErase` type defines the deferred-callback contract each eraser may return.
- **`src/modules/users/erasure-registry.ts`** — `personalDataErasers()` supplies the ordered list of hooks the cascade runs.
- **`src/modules/users/audit.ts`** — `usersAuditActions` provides the action constants for audit rows.
- **`src/modules/users/events.ts`** — `USER_ERASED` and `USER_DELETION_CANCELED` event names for the outbox.
- **`src/modules/users/repository.ts`** — `userRepository` for `save`, `deleteOne`, `forgetHoldSetter`, `restoreScheduledDeletion`, `findById`.
- **`src/modules/users/model.ts`** — `UserDocument` type used throughout.
- **`src/modules/users/services/cleared-account.ts`** — `withClearedAccount` gates `restoreById` and `removeById` with the caller's staff-permission check.

## Notes

- Erasers run **sequentially**, not in parallel: a Mongoose `ClientSession` permits only one in-flight operation, and concurrent access throws a misleading "sharded cluster" error.
- `erase` and `remove` are marked `@internal` (unpublished) because a sibling caller could erase an administrator with no permission check; only `removeById` / `restoreById` are the sanctioned public doors.
- Soft delete is idempotent — a second `DELETE` on an already-soft-deleted user returns 200 without re-stamping.
- `deletedBy` is set to `'reaper'` **only** when the caller is a system caller (`context.caller.system`), so the scheduled purge is the only path that may later hard-delete the account.
- Post-erasure deferred work (`runAfterErase`) **never rejects**: the account is already committed as gone, so a failure cannot be surfaced as a failed erasure; the log is the only observable trace.
- The `claim` parameter on `erase` exists to resolve a race between the scheduled purge and a concurrent `restoreById`; if the claim resolves `false`, nothing is written and the function returns `false`.
