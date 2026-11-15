---
source: src/modules/users/services/own-account.ts
sha256: f9eb1555bf2cefbba580b1f13eaa9eadf6a2c62b7c40d2f076008664c3c316b8
generated_at: 2026-11-14T22:29:08.300001+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/services/own-account.ts

## Purpose

Provides the owner-facing and system-facing account operations that the admin doors (`updateById`, `removeById`) cannot serve: the owner editing their own profile, the inactivity reaper's soft-delete and purge, the owner's scheduled deletion lifecycle (lock → restore → erase), and the ops reapply-erasures workflow. Each function narrows the internal `update` / `remove` primitives (which skip ban checks and staff protection) into a safe, audited surface.

## Key elements

- **`OwnProfileData`** — Exported type; the writable subset of an admin edit minus `active` (and `role`), so an owner can never ban/unban themselves.
- **`updateOwnProfile`** — Thin wrapper around the internal `update`; delegates a `SaveHook` for an outbox row committed in the same save.
- **`softDeleteInactive`** — Reaper soft-delete. Rejects if `inactivityWarnedAt` is missing; returns `false` if the account holds a staff role (race guard). Audits as `SYSTEM_USER_SOFT_DELETED`.
- **`eraseInactive`** — Reaper hard-delete. Only proceeds when `deletedBy === 'reaper'`; otherwise rejects. Audits as a system erase.
- **`scheduleOwnDeletion`** — Owner locks their own account: stamps `deletedAt`, `deletedBy: 'owner'`, `purgeAt`, calls `markSessionsEnded`, and saves inside `withTransaction`. Accepts an `InTransaction` callback for the caller's ledger write. Does **not** go through `remove` (avoids an admin audit entry).
- **`restoreOwnAccount`** — Restores a locked account if `purgeAt` has not passed. Sessions stay dead; owner must sign in again. Returns `false` if the purge is due or a concurrent restore won.
- **`eraseScheduledDeletion`** — Purge-job door. Uses `claimScheduledErasure` as the first transactional write so a concurrent restore wins. Audits as `SYSTEM_USER_ERASED`.
- **`findDueScheduledDeletions`** — Returns all owner-locked accounts whose `purgeAt ≤ now`; the purge job's read.
- **`eraseAgain`** *(ops)* — Re-erases an account on a restored DB, preserving the original `erasedAt`. System-caller only.
- **`restoreDeletionState`** *(ops)* — Reapplies or clears an owner-deletion lock from the erasure ledger on a restored DB. System-caller only. Records an audit entry when changed.
- **`InTransaction`** *(local, unexported)* — `(session: ClientSession) => Promise<void>`; a write that must commit atomically with the lock change.
- **`requireSystemCaller`** *(local, unexported)* — Throws unless `context.caller.system` is truthy. Guards `eraseAgain` and `restoreDeletionState`.

## Relationships

- **`src/modules/users/services/update.ts`** — wraps the `@internal` `update` primitive (and its `SaveHook` type); that function is not exported for other modules.
- **`src/modules/users/services/remove.ts`** — wraps the `@internal` `remove` and `erase` primitives; they are not exported for other modules.
- **`src/modules/users/repository.ts`** — calls `userRepository.save`, `.findById`, `.restoreScheduledDeletion`, `.findScheduledDeletionsDue`, `.claimScheduledErasure`, `.setOwnerDeletionState`.
- **`src/modules/access/index.ts` / `src/modules/access/services/index.ts`** — `accessService.holdsStaffRole` in `softDeleteInactive` guards against deleting a staff account.
- **`src/modules/users/services/credentials.ts`** — `markSessionsEnded` invalidates all session tokens on the account during `scheduleOwnDeletion`.
- **`src/infrastructure/runtime/database.ts`** — `withTransaction` wraps the save in `scheduleOwnDeletion`.
- **`src/infrastructure/observability/audit.ts` / `src/modules/users/audit.ts`** — `recordAudit` and `usersAuditActions` for the ops-restore path.
- **`src/types/auth-context.ts` / `src/types/index.ts`** — `CallerContext` discriminates owner vs. system vs. admin callers.
- **`src/infrastructure/http/response.ts`** — `ResponseSuccess` / `ResponseReject` union returned by `updateOwnProfile`.
- **`src/modules/users/model.ts`** — `UserDocument` type used throughout.
- **`src/modules/users/friends/account.ts`** — the friends/account module consumes owner-account operations.
- **`src/modules/users/tests/factories.ts`** — test setup wires these functions into integration tests.

## Notes

- `update` and `remove` (the wrapped primitives) are deliberately `@internal`: they skip the ban check and staff protection that the admin doors enforce. Only this file may call them, so the safety invariants live in the wrappers here.
- `scheduleOwnDeletion` does **not** call `remove`; doing so would emit an admin-style audit entry. The owner's own caller context is recorded instead.
- The `alsoInSave` / `alsoInTransaction` / `session` parameters let the *calling* module commit its own ledger row atomically with the account state change. This file does not know what that row is.
- `requireSystemCaller` is a hard throw (synchronous), not a rejected promise. Callers that forget to guard against non-system callers will crash the request handler rather than receive a clean rejection.
- The reaper's two-step path (`softDeleteInactive` → `eraseInactive`) is enforced by the `deletedBy === 'reaper'` stamp; the owner-scheduled path (`scheduleOwnDeletion` → `eraseScheduledDeletion`) is enforced by the `claimScheduledErasure` optimistic lock. Mixing the two (e.g., an admin erasing a reaper-soft-deleted row) is intentionally blocked.
