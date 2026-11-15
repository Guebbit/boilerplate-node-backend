---
source: tests/integration/concurrency/account-deletion-races.test.ts
sha256: 7219e587de32d2779898f3f1d0ffa9784cf2aa38e4e3c127aa1c7332c975a787
generated_at: 2026-11-14T23:10:45.345149+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/concurrency/account-deletion-races.test.ts

## Purpose

Verifies the invariant that a concurrent account **erase** (purge) and **restore** at the grace-period boundary resolves to exactly one outcome per account — erased *or* restored, never both, never an error. The test simulates the worst-case split: two app nodes whose clocks disagree by one second, so both the purge predicate (`purgeAt <= now`) and the restore predicate (`purgeAt > now`) are simultaneously true from each node's perspective.

## Key elements

- **`onTheEdge(index)`** — factory helper that creates a user with `deletedAt` = 1 day ago, `deletedBy = 'owner'`, and `purgeAt` = `now − 1 s`, placing the account exactly on the grace boundary.
- **`describe('restore against the purge at the boundary')`** — single test that fires `RACE_SIZE` concurrent erase/restore pairs via `Promise.allSettled` and asserts the XOR invariant per account.
- **Erase call** — `accountUserService.eraseScheduledDeletion(user, systemCallerContext('User'), new Date())`: uses the real "now", so the purge predicate is satisfied.
- **Restore call** — `accountUserService.restoreOwnAccount(user, new Date(purgeAt − 1), session)`: wrapped in `withTransaction`, uses a clock 1 ms behind `purgeAt`, so the restore predicate is also satisfied.
- **Final assertion loop** — checks both promises fulfilled, exactly one returned truthy (`erasedOk !== restoredOk`), and `userRepository.findById` confirms the row's final state matches.

## Relationships

- **`tests/support/setup-test-db.ts`** — `setupTestDb()` bootstraps an isolated database before the suite.
- **`tests/support/checkout-modules.ts`** — `registerCheckoutModules()` wires the module graph in `beforeEach`.
- **`src/kernel/events.ts`** — `resetDomainEvents()` clears the domain-event bus in `afterEach` to prevent cross-test leakage.
- **`src/kernel/permissions.ts`** — `systemCallerContext('User')` supplies the caller identity required by the erase path.
- **`src/modules/users/tests/factories.ts`** — provides `createUser` (test fixture) and `userRepository` (post-race state check).
- **`src/modules/users/friends/account.ts`** — `accountUserService` exposes the two competing operations under test.
- **`tests/support/race.ts`** — exports `RACE_SIZE`, the number of concurrent account pairs to create.
- **`src/infrastructure/runtime/database.ts`** — `withTransaction` wraps the restore so it runs as an atomic write, mirroring the production erase-transaction path.

## Notes

- The "two nodes" are simulated in a single process by passing different `Date` values to the two service methods; there is no actual network or multi-process concurrency.
- `Promise.allSettled` (not `Promise.all`) is deliberate: both operations must complete even if one would throw, so the test can assert the *result* rather than aborting on the first failure.
- The core correctness guarantee is expected to come from the database layer (unique constraint, row-level locking, or `purgeAt` re-read inside the transaction), not from application-level checks — this test exercises that guarantee.
