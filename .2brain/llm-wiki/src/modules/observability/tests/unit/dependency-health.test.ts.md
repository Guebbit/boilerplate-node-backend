---
source: src/modules/observability/tests/unit/dependency-health.test.ts
sha256: 2492a5572cc559c10f03d1545dc316e35b97c77997825358a51a9237973237f9
generated_at: 2026-09-23T18:58:08.850085+00:00
model: ollama:qwen3.8:27b
---

# src/modules/observability/tests/unit/dependency-health.test.ts

## Purpose

Unit tests for the dependency-health readiness fold. Pins the mapping from each dependency's raw connection state to its semantic word (`ready`, `connecting`, `unavailable`, `disabled`) and verifies the `overallStatus` aggregation rule — specifically that `disabled` never degrades a service while `connecting` and `unavailable` always do. Exists because a contract/integration test can only assert the payload shape; this file is where the _meaning_ of each state is locked down.

## Key elements

- **`withReadyState(state)`** — local helper that redefines `connection.readyState` via `Object.defineProperty`, avoiding a real database connection.
- **`health(overrides?)`** — local helper returning a fully-`ready` `DependencyHealth` object with optional per-key overrides; used as the baseline for `overallStatus` cases.
- **`describe('dependencyHealth')`** — asserts the mongoose `readyState →` word mapping (1→`ready`, 2→`connecting`, 0→`unavailable`, 3→`unavailable`, 99→`unavailable`) and that the service _asks_ each adapter for its state rather than probing it directly.
- **`describe('overallStatus')`** — asserts the fold: all-ready → `ok`; any `disabled` → still `ok`; any `connecting` or `unavailable` on any dependency → `degraded`.
- **Mocks** — `cacheState` and `queueState` are `jest.mock`-ed; `connection` is patched in-place. No network or real adapter code runs.

## Relationships

- **`src/modules/observability/services/dependency-health.ts`** — the module under test. The file imports `dependencyHealth`, `overallStatus`, and the `DependencyHealth` type from it.
- **`src/infrastructure/runtime/database.ts`** — provides the `connection` object whose `readyState` the test mutates to simulate Mongoose states.
- **`src/infrastructure/adapters/cache.ts`** — provides `cacheState`; fully mocked so the test controls its return value.
- **`src/infrastructure/adapters/queue.ts`** — provides `queueState`; fully mocked for the same reason.

## Notes

- Mongoose `readyState` 3 is `disconnecting`, not `connecting`. The test deliberately maps it to `unavailable` so a shutdown is never reported as a startup.
- Unknown/future `readyState` values (e.g. 99) resolve to `unavailable` — the "safe direction" is to degrade a healthy service rather than to report a dead one as serving.
- `disabled` is a _word_ (the dependency is intentionally absent) but not a _status_; `connecting` is a distinct word from `unavailable` yet both fold to `degraded`. The test encodes both distinctions.
- The test never opens a socket. All "states" are produced by overriding `readyState` or by the mocked adapter functions, so the suite is deterministic regardless of `.env`.
