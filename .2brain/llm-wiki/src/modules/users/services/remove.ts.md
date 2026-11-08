---
source: src/modules/users/services/remove.ts
sha256: 978569917a87f7fda747cae27370087e5843c6aa619de277456d7f6c113a5f11
generated_at: 2026-11-08T08:51:47.127317+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/services/remove.ts

## Purpose

Implements the full lifecycle of user deletion: soft delete, hard delete (erasure), scheduled-deletion cancellation, and restore. It ensures a hard delete's cascade (personal-data erasure, membership removal, document deletion, event emission) is atomic via a Mongoose transaction, while post-commit side-effects (deferred eraser work, image cleanup, audit) run best-effort outside it.

## Key elements

- **`remove(user, hardDelete?, context?)`** *(exported, `@internal`)* — Entry point for soft or hard delete on an already-loaded document. Soft path stamps `deletedAt`, revokes sessions, optionally tags `deletedBy: 'reaper'`, saves, and audits. Hard path delegates to `erase`. Idempotent for soft delete (returns 200 if already deleted).
- **`erase(user, context?, claim?, erasedAt?)`** *(exported, `@internal`)* — Hard delete. Wraps `runErasureCascade` in `withTransaction`; on lost `claim` race returns 409 `USER_ERASURE_NOT_DUE`. After commit: nudges outbox, runs deferred post-erasure work, removes the user's image, records the audit row.
- **`removeById(id, hardDelete?, context)`** *(exported)* — Fetches the document, checks `roleProtectedRefusal`, then delegates to `remove`.
- **`restoreById(id, context)`** *(exported)* — Undoes a soft delete. Routes to `restoreScheduled` when `deletedBy === 'owner'`; otherwise clears `deletedAt`/`deletedBy`, saves, and audits. Sessions remain revoked.
- **`runErasureCascade`** *(private)* — Sequentially runs every registered `personalDataErasers()` hook in the session, calls `forgetHoldSetter`, deletes the user doc, and enqueues `USER_ERASED`. Returns the `AfterErase[]` deferred work.
- **`runAfterErase`** *(private)* — Executes deferred post-commit work; each failure is caught individually and logged only (never rejects, since the account is already gone).
- **`restoreScheduled(user, context)`** *(private)* — Cancels a self-requested deletion if `purgeAt > now`; uses `announceInTransaction` to atomically clear the schedule and emit `USER_DELETION_CANCELED`.

## Relationships

- **`@kernel/outbox`** — `enqueueOutboxEvent` (persist `USER_ERASED` in-transaction), `announceInTransaction` (atomic conditional update + event for `restoreScheduled`), `nudgeOutbox` (flush after hard-delete commit).
- **`@kernel/registry`** — Imports the `AfterErase` type returned by eraser hooks.
- **`../erasure-registry`** — Calls `personalDataErasers()` to enumerate hooks for the cascade.
- **`../audit`** — Supplies action constants (`SYSTEM_USER_ERASED`, `ADMIN_USER_SOFT_DELETED`, etc.) for `recordAudit`.
- **`../events`** — Emits `USER_ERASED` and `USER_DELETION_CANCELED`.
- **`../model`** — Operates on `UserDocument`.
- **`@modules/access`** — `accessService.roleProtectedRefusal` guards `removeById` and `restoreById`.
- **`@infrastructure/runtime/database`** — `withTransaction` provides the `ClientSession` for atomicity.
- **`@infrastructure/adapters/image-store`** — `imageStore.remove(user.imageUrl)` after hard-delete commit.
- **`@infrastructure/adapters/logger`** — Error logging in `runAfterErase`.
- **`@infrastructure/http/response`** — `generateSuccess` / `generateReject` for all return values.
- **`@infrastructure/i18n`** — `t()` for user-facing error messages.
- **`@infrastructure/observability/audit`** — `recordAudit` on every state change.

## Notes

- **Sequential, not parallel, erasure cascade.** A Mongoose `ClientSession` executes one operation at a time; using `Promise.all` over erasers causes a misleading "sharded cluster" error.
- **`@internal` on `remove`/`erase`.** These are deliberately unpublished so a sibling module cannot erase an administrator without the access check that `removeById`/`restoreById` enforce.
- **Post-erasure failures are silent.** `runAfterErase` swallows every rejection into a log line; the erasure itself is already committed and cannot be rolled back.
- **`claim` parameter (purge-vs-restore race).** The scheduled purge passes a conditional write; if the account was restored in the meantime, the transaction resolves `false` and nothing is deleted. `restoreScheduled` mirrors this with `purgeAt > now`.
- **Soft delete is idempotent.** Repeated `DELETE` calls return 200 with the existing document rather than erroring.
- **`deletedBy: 'reaper'`** is set only when `context.caller.system` is truthy, restricting later auto-hard-delete to the inactivity reaper's own soft deletes.
