---
source: tests/integration/concurrency/account-deletion-races.test.ts
sha256: afbf47e4f0b37910b49f1bbdbac5e48caca0d5309355aa4431c9f31e6e78fb7d
generated_at: 2026-10-29T06:53:08.010747+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/concurrency/account-deletion-races.test.ts

## Purpose

Verifies that when a user account's `purgeAt` timestamp falls exactly on the boundary between two nodes' disagreeing clocks, a concurrent `eraseScheduledDeletion` and `restoreOwnAccount` yields exactly one winner — the row is either erased or restored, never both and never an error.

## Key elements

- **`setupTestDb()`** — one-time database initialization for the test file.
- **`beforeEach → registerCheckoutModules()`** — registers the domain modules (users, etc.) needed for service calls.
- **`afterEach → resetDomainEvents()`** — clears the in-memory domain event bus between tests.
- **`onTheEdge(index)`** — creates a user whose `purgeAt` is 1 second in the past, placing it on the boundary between "grace over" and "grace running" depending on the observer's clock.
- **`describe("restore against the purge at the boundary")`** — single test case that fires `RACE_SIZE` concurrent (erase, restore) pairs and asserts mutual exclusivity on the stored row.

## Relationships

- **`tests/support/setup-test-db.ts`** — provides `setupTestDb` for isolated database state.
- **`tests/support/checkout-modules.ts`** — provides `registerCheckoutModules` to wire up module services for the test environment.
- **`src/kernel/events.ts`** — provides `resetDomainEvents` used in `afterEach` to prevent cross-test event leakage.
- **`src/kernel/permissions.ts`** — provides `systemCallerContext('User')`, the caller identity passed to `eraseScheduledDeletion`.
- **`src/modules/users/index.ts`** — re-exports `userService` (with `eraseScheduledDeletion` and `restoreOwnAccount`).
- **`src/modules/users/tests/factories.ts`** — provides `createUser` (to set the edge-case row) and `userRepository` (to read back the final state for assertions).
- **`tests/support/race.ts`** — provides `RACE_SIZE`, the number of concurrent race pairs to execute.

## Notes

- The test simulates clock skew by passing `new Date(purgeAt.getTime() - 1)` as the "now" to `restoreOwnAccount`, while `eraseScheduledDeletion` receives `new Date()` (real time). Since `purgeAt` is already 1 s in the past, the erase path sees `purgeAt <= now` while the restore path sees `purgeAt > now`.
- Both calls are wrapped in `Promise.allSettled` so a rejection in one does not prevent the other from completing; the assertions then check that exactly one fulfilled successfully.
- The invariant under test: purge claims rows where `purgeAt <= now`, restore matches only `purgeAt > now` — with a single clock these predicates are mutually exclusive, and the test confirms the database enforces that even under simulated disagreement.
