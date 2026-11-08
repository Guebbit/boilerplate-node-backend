---
source: tests/integration/concurrency/account-deletion-races.test.ts
sha256: afbf47e4f0b37910b49f1bbdbac5e48caca0d5309355aa4431c9f31e6e78fb7d
generated_at: 2026-11-08T09:36:02.453843+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/concurrency/account-deletion-races.test.ts

## Purpose

Verifies that when a scheduled purge and a self-restore race at the exact boundary of the grace period (simulated by two disagreeing clocks), each account is handed to exactly one operation — never both, never neither, and never an error. It guards the invariant that the purge claims `purgeAt <= now` while the restore matches only `purgeAt > now`, so with consistent clocks they are mutually exclusive.

## Key elements

- **`onTheEdge(index)`** – Creates a user whose `purgeAt` is 1 second in the past, simulating the edge where one node sees the grace expired and another still running. Returns `{ user, purgeAt }` for use in the race.
- **`"gives each account to exactly one of them"`** (the single test) – Spawns `RACE_SIZE` parallel rounds; in each round fires `userService.eraseScheduledDeletion` (with `now`) and `userService.restoreOwnAccount` (with `purgeAt − 1 ms`) concurrently via `Promise.allSettled`, then asserts a strict XOR: exactly one succeeds and the DB row reflects that outcome.

## Relationships

- **`tests/support/setup-test-db.ts`** → `setupTestDb()` initializes the test database before all tests.
- **`tests/support/checkout-modules.ts`** → `registerCheckoutModules()` wires the users module into the kernel each test run.
- **`tests/support/race.ts`** → `RACE_SIZE` controls how many concurrent account pairs are raced in a single test.
- **`src/kernel/events.ts`** → `resetDomainEvents()` clears the event bus in `afterEach` to prevent cross-test leakage.
- **`src/kernel/permissions.ts`** → `systemCallerContext('User')` supplies the caller identity for the system-initiated erase path.
- **`src/modules/users/index.ts`** → Exports `userService`, the service whose two methods (`eraseScheduledDeletion`, `restoreOwnAccount`) are the racing actors.
- **`src/modules/users/repository.ts`** → `userRepository.findById` is used after the race to assert the final row state (present or null).
- **`src/modules/users/tests/factories.ts`** → `createUser` builds the fixture accounts with the specific `purgeAt` / `deletedAt` timestamps.

## Notes

- The "clock skew" is simulated purely by passing two different `Date` objects to the two service calls — no actual multi-node setup. The restore call uses `purgeAt − 1 ms` so it lands on the "grace still running" side of the boundary.
- The test asserts `erasedOk !== restoredOk` (XOR) rather than checking which one won, making the test order-independent and tolerant of whichever side the DB happens to favor.
- Both calls are wrapped in `Promise.allSettled`, so a rejection on either side is still observable and asserted on (the test expects `fulfilled` for both, meaning neither should throw).
