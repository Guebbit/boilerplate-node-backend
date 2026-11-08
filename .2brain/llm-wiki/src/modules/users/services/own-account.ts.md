---
source: src/modules/users/services/own-account.ts
sha256: 748ce08c339de47b53da5ae735c88bcf41d849380f5d96314ed39658f058d46e
generated_at: 2026-11-08T08:50:15.075824+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/services/own-account.ts

## Purpose

Owner-facing doors into the account record for operations the admin doors (`updateById`, `removeById`) do not cover: the owner editing their own profile, the inactivity reaper's soft/hard delete cycle, the owner's scheduled deletion (lock → restore → purge), and the ops `reapply-erasures` commands. Each exported function narrows or guards the `@internal` raw `update` / `remove` it wraps, which deliberately skip the ban check and staff protection the admin path enforces.

## Key elements

- **`OwnProfileData`** — type; `update`'s data minus `active`, so a self-edit can never ban or unban.
- **`updateOwnProfile`** — thin wrapper over `update`; delegates save-hook to the caller.
- **`softDeleteInactive`** — reaper's soft delete; 409 if the account was never warned or holds a staff role.
- **`eraseInactive`** — reaper's hard delete; 409 unless `deletedBy === 'reaper'` (the reaper can only finish what it started).
- **`scheduleOwnDeletion`** — stamps `deletedAt` / `deletedBy: 'owner'` / `purgeAt`, kills all sessions via `markSessionsEnded`, commits in one `withTransaction`. Bypasses `remove` on purpose (avoids admin-style audit).
- **`restoreOwnAccount`** — cancels a scheduled deletion before `purgeAt`; returns `false` if the purge is already due or another restore won.
- **`eraseScheduledDeletion`** — purges a due scheduled deletion; first write is a claim on `purgeAt <= now`, so a concurrent restore wins and this 409s.
- **`findDueScheduledDeletions`** — lists accounts whose `purgeAt` has passed; the purge job's read door.
- **`eraseAgain`** — ops reapply: re-erases on a restored DB, preserving the original `erasedAt`. System-caller only.
- **`restoreDeletionState`** — ops reapply: sets or clears the deletion lock to match the erasure ledger. System-caller only; writes an audit row.
- **`requireSystemCaller`** *(private)* — throws unless `context.caller.system` is true; guards the two ops doors.
- **`InTransaction`** *(private type)* — `(session: ClientSession) => Promise<void>`, the callback shape for writes that must commit atomically with a state change.

## Relationships

- **`./update.ts`** — imports `update` and the `SaveHook` type; `updateOwnProfile` is a direct pass-through.
- **`./remove.ts`** — imports `remove` and `erase`; used by every delete/erase door in this file.
- **`./credentials.ts`** — imports `markSessionsEnded`; called inside `scheduleOwnDeletion` to kill all active tokens.
- **`../repository.ts`** — imports `userRepository`; used for `save`, `restoreScheduledDeletion`, `claimScheduledErasure`, `findScheduledDeletionsDue`, `findById`, `setOwnerDeletionState`.
- **`../model.ts`** — imports `UserDocument` (the Mongoose doc type threaded through every function).
- **`../audit.ts`** — imports `usersAuditActions`; used in `restoreDeletionState`'s audit record.
- **`@modules/access` / `services/index.ts`** — imports `accessService`; `softDeleteInactive` calls `accessService.holdsStaffRole` to reject staff accounts.
- **`@infrastructure/http/response.ts`** — imports `generateReject`, `ResponseSuccess`, `ResponseReject` for typed 409 / success shapes.
- **`@infrastructure/i18n`** — imports `t` for i18n error messages.
- **`@infrastructure/observability/audit.ts`** — imports `recordAudit` for the ops-restore audit trail.
- **`@infrastructure/runtime/database.ts`** — imports `withTransaction`; wraps `scheduleOwnDeletion`, `restoreOwnAccount` in atomic transactions.
- **`src/modules/users/tests/factories.ts`** — test fixtures that construct `UserDocument` and `CallerContext` values for this module's tests.
- **`src/modules/users/services/index.ts`** — barrel file that re-exports this module's public API.

## Notes

- The module's doc block explicitly states that raw `update` / `remove` skip the ban check and staff protection; this file is the *only* caller allowed to use them, which is why they remain `@internal`.
- `scheduleOwnDeletion` saves the document directly via `userRepository.save` rather than routing through `remove`, so the audit trail records the owner's action rather than an admin erase.
- `eraseAgain` and `restoreDeletionState` are gated by `requireSystemCaller`; any non-system caller throws before any DB write occurs.
- `softDeleteInactive` treats a missing `inactivityWarnedAt` as a fairness precondition (the warning is the "notice"), not merely a state check.
- The `now` parameter in `restoreOwnAccount`, `eraseScheduledDeletion`, and `findDueScheduledDeletions` defaults to `new Date()`; callers that need deterministic time (jobs, tests) pass it explicitly.
