---
source: src/modules/users/services/own-account.ts
sha256: 0e871558c1f3ca3a671284f467194d232e0dcde639dc981e40580ae389afdbbc
generated_at: 2026-10-29T06:17:04.926382+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/services/own-account.ts

## Purpose

Provides the "owner-facing" and "reaper-facing" doors into user records: an account editing its own profile, the inactivity reaper's soft-delete/erase cycle, and the owner-scheduled deletion lifecycle (lock → grace → restore or purge). It wraps the `@internal` `update` and `remove` services—both of which skip the ban-check and staff-protection guards the admin doors enforce—with the additional invariants that each caller type requires.

## Key elements

- **`OwnProfileData`** — type alias: `update`'s data minus `active`, so a profile edit can never ban/unban the account.
- **`updateOwnProfile`** — delegates to `update` with no extra guards; the absence of `active` in the type is the guard.
- **`softDeleteInactive`** — reaper's soft delete. Rejects 409 if `inactivityWarnedAt` is missing (unfair to delete without warning) or if the account holds a staff role (read-error guard).
- **`eraseInactive`** — reaper's hard delete. Only succeeds when `deletedBy === 'reaper'`; 409 otherwise so the reaper cannot finish an admin-initiated deletion.
- **`scheduleOwnDeletion`** — stamps `deletedAt`, `deletedBy: 'owner'`, `purgeAt` and calls `markSessionsEnded` in a single save. Bypasses `remove` deliberately so the audit trail records the owner, not an admin.
- **`restoreOwnAccount`** — calls `userRepository.restoreScheduledDeletion`; returns `false` if the purge is already due or another restore won. Sessions stay dead.
- **`eraseScheduledDeletion`** — purge-job hard delete. Uses a `claimScheduledErasure` hook so the first writer claims `purgeAt <= now`; a concurrent restore that won the race causes a 409.
- **`findDueScheduledDeletions`** — repository pass-through that lists owner-scheduled accounts whose grace has expired (the purge job's input).

## Relationships

- **`./update`** — `updateOwnProfile` delegates to `update`; the `SaveHook` type is re-exposed.
- **`./remove`** — `softDeleteInactive`, `eraseInactive`, and `eraseScheduledDeletion` delegate to `remove` / `erase`.
- **`./credentials`** — `scheduleOwnDeletion` calls `markSessionsEnded` to invalidate all active tokens.
- **`../repository`** — `scheduleOwnDeletion`, `restoreOwnAccount`, `eraseScheduledDeletion`, and `findDueScheduledDeletions` all read/write through `userRepository`.
- **`@modules/access`** — `softDeleteInactive` calls `accessService.holdsStaffRole` before allowing a reaper delete.
- **`@infrastructure/http/response`** — all reject paths use `generateReject`.
- **`@infrastructure/i18n`** — reject messages are translated via `t`.
- **`../model`** — operates on `UserDocument`.
- **`@types`** — `CallerContext` is the audit/context parameter on every function.
- **`./index.ts`** — barrel export that surfaces these functions to the module's public API.

## Notes

- The raw `update` and `remove` services are marked `@internal` specifically so that only this file (and the admin doors) can reach them; they carry no ban-check or staff-protection logic.
- `scheduleOwnDeletion` intentionally does **not** call `remove`; the audit row must record the owner's own caller, not an admin action.
- The reaper distinguishes its own soft-deletes via `deletedBy: 'reaper'`; the owner uses `'owner'`. `eraseInactive` will 409 on any row it did not soft-delete, and `eraseScheduledDeletion` only targets owner-scheduled rows.
- `restoreOwnAccount` and `eraseScheduledDeletion` are designed to be mutually exclusive via a database-level claim; the boolean return on restore signals which side won the race.
- `now` parameters default to `new Date()` and are documented as "app time, never the database's clock"—callers (purge job, reaper) are expected to pass a consistent timestamp.
