---
source: src/modules/users/services/remove.ts
sha256: 15736f63d6e942caf3dd050da84eaf9c81db281b36fb2a648529ee69d38d0504
generated_at: 2026-10-29T06:18:22.158177+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/services/remove.ts

## Purpose

Implements the full lifecycle of user deletion and restoration: soft delete (timestamp stamp), hard delete (erasure cascade + row removal), restore of soft-deleted accounts, and cancellation of a scheduled (owner-initiated) deletion before its grace period expires. All state changes are transactional where needed, and every mutation is paired with an audit row and, for hard delete, an outbox event.

## Key elements

- **`remove`** (exported) — Core soft/hard delete. Soft path: stamps `deletedAt`, calls `markSessionsEnded`, saves, records audit. Hard path: delegates to `erase`. Idempotent — an already-soft-deleted user returns 200 without re-stamping.
- **`erase`** (exported) — Hard delete. Opens a transaction, optionally runs a `claim` predicate (concurrent-writer guard for the scheduled-purge vs. restore race), runs `runErasureCascade`, then post-commit: deferred eraser work, image removal, audit row.
- **`runErasureCascade`** (internal) — Iterates `personalDataErasers()` sequentially within the session, calls `forgetHoldSetter`, deletes the user document, enqueues `USER_ERASED` to the outbox. Returns deferred `AfterErase[]` callbacks.
- **`runAfterErase`** (internal) — Executes deferred post-commit callbacks. Never rejects; individual failures are caught and logged only.
- **`removeById`** (exported) — Public entry point. Fetches the user, calls `accessService.roleProtectedRefusal`, then delegates to `remove`.
- **`restoreById`** (exported) — Undoes a soft delete. Rejects if not soft-deleted (409) or the caller lacks role authority (403). If `deletedBy === 'owner'`, delegates to `restoreScheduled`.
- **`restoreScheduled`** (internal) — Cancels an owner-requested deletion if `purgeAt > now` still holds. Uses `announceInTransaction` with `USER_DELETION_CANCELLED`.

## Relationships

- **`@infrastructure/runtime/database`** — `withTransaction` wraps the entire hard-delete cascade so it is atomic.
- **`@kernel/outbox`** — `enqueueOutboxEvent` records `USER_ERASED` inside the transaction; `nudgeOutbox` triggers delivery post-commit; `announceInTransaction` is used by `restoreScheduled` for `USER_DELETION_CANCELLED`.
- **`@kernel/registry`** — Supplies the `AfterErase` type (deferred post-commit work returned by eraser hooks).
- **`@modules/users/erasure-registry`** — `personalDataErasers()` is iterated in `runErasureCascade`; each eraser receives the `ClientSession` and a `PersonalDataSubject`.
- **`@modules/users/audit`** — `usersAuditActions` enum values determine which audit action is recorded per path (admin vs. system, soft vs. hard, restore).
- **`@modules/users/events`** — `USER_ERASED` and `USER_DELETION_CANCELLED` event names passed to the outbox.
- **`@modules/users/model`** — `UserDocument` is the shape operated on throughout.
- **`@modules/access`** — `accessService.roleProtectedRefusal` guards `removeById` and `restoreById` against unauthorised staff-role manipulation.
- **`@infrastructure/adapters/image-store`** — `imageStore.remove(user.imageUrl)` is called after a successful hard delete commits.
- **`@infrastructure/observability/audit`** — `recordAudit` writes the audit row for every soft-delete, hard-delete, and restore.
- **`@infrastructure/http/response`** — `generateSuccess` / `generateReject` shape every return value.
- **`@infrastructure/i18n`** — `t` localises user-facing error messages (e.g. `users.erasure-not-due`).
- **`@infrastructure/adapters/logger`** — `logger.error` is the sole signal for a failed post-erasure deferred step.

## Notes

- **Sequential eraser execution is intentional.** A Mongoose `ClientSession` supports only one in-flight operation; using `Promise.all` triggers a misleading "sharded cluster" error.
- **`remove` is `@internal` and performs no authorization.** It trusts the caller to have already validated. All public routes go through `removeById`, which applies `roleProtectedRefusal`.
- **Soft delete is idempotent.** Re-calling `remove` on an already-soft-deleted user returns 200 immediately; there is no 409.
- **`deletedBy: 'reaper'`** is set only when `context.caller.system` is truthy, restricting later hard-delete of that soft-delete to the system reaper.
- **Post-erasure deferred work never rejects.** The account is already gone; a failure is logged and swallowed so subsequent steps still run.
- **The `claim` parameter on `erase`** is an optimistic-concurrency guard: if the claim resolves `false`, the transaction commits with no deletes and the caller receives 409 `USER_ERASURE_NOT_DUE`. This prevents a race between a scheduled purge and a concurrent restore.
- **`markSessionsEnded` moves the token epoch in the same `save` as `deletedAt`**, so a restore does not silently revive old sessions.
