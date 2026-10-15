---
source: src/modules/users/tests/integration/reaper.test.ts
sha256: 7c96c9eda751a2314d0bf72ba83ed0fdb0f4db90ce1a324ae98f2ee9adb4de23
generated_at: 2026-10-15T12:14:29.296226+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/tests/integration/reaper.test.ts

## Purpose

Integration tests for the inactivity reaper's three stages (warn → soft-delete → hard-delete). Verifies that only customer-level accounts are ever candidates—staff, admin, and platform-operator accounts are excluded at every stage—plus edge cases around grace periods, re-warnings after a return, API-key activity, and the `deletedBy` marker that distinguishes reaper soft-deletes from staff-initiated ones.

## Key elements

- **`makeInactive(id, extra?)`** – Backdates `createdAt` (as a proxy for last activity) to a fixed 2020 date; uses `overwriteImmutable: true` + `timestamps: false` to bypass Mongoose's immutability guard on `createdAt`. Accepts extra fields to layer on stage-specific markers.
- **`inactiveAccount(name, role?, platformRole?)`** – Creates a user via the factory, optionally assigns a platform role, then backdates it. Returns the created user.
- **`describe("the inactivity reaper's candidates")`** – Covers the three finder methods (`findInactiveUnwarned`, `findWarnedStillInactive`, `findReaperSoftDeletedPastGrace`) across role exclusions, grace-period boundaries, re-warning after a return, already-warned dedup, disabled accounts, and staff soft-delete exclusion.
- **`describe("who soft-deleted the account")`** – Confirms `userService.remove` with a system caller stamps `deletedBy: 'reaper'`, a staff caller leaves it unset, and `restoreById` clears it.
- **`describe("API-key use counts as activity")`** – Verifies `lastApiKeyUseAt` suppresses candidacy in both warn and soft-delete stages, and that `touchApiKeyUse` throttles to one stamp per calendar day.
- **`markerOf(id)`** – Reads the raw `deletedBy` field from the DB for assertions.

## Relationships

- **`src/modules/users/services/index.ts`** – Primary SUT: calls `findInactiveUnwarned`, `findWarnedStillInactive`, `findReaperSoftDeletedPastGrace`, `remove`, `restoreById`, and `touchApiKeyUse`.
- **`src/modules/users/model.ts`** – `userModel` used for raw `updateOne` (backdating) and `findById` (reading `deletedBy`).
- **`src/modules/users/tests/factories.ts`** – `createUser` factory to seed accounts with a role.
- **`src/modules/access/index.ts`** – `assignRole` to grant platform-level roles (e.g. `operator`).
- **`src/kernel/permissions.ts`** – `systemCallerContext('User')` to simulate the reaper's own privileged caller.
- **`tests/support/callers.ts`** – `callerContextAs('admin')` to simulate a staff-initiated delete.
- **`tests/support/setup-test-db.ts`** – `setupTestDb()` invoked at module top-level to reset the in-memory DB before the suite runs.

## Notes

- `setupTestDb()` runs at import time (module scope), not inside a `beforeAll`; tests rely on the shared `LONG_AGO` / `NOW` constants rather than per-test isolation.
- `createdAt` is used as the "last activity" clock throughout; the file's doc comment explains this is valid because the test accounts never refresh a session.
- `emailsOf` uses `.toSorted()` (immutable) to keep the input array untouched.
- The "stamps the use once a day" test hardcodes 2026 dates; it verifies calendar-day boundary logic in `touchApiKeyUse` without mocking `Date.now()`.
