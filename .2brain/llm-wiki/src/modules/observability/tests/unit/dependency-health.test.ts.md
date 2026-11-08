---
source: src/modules/observability/tests/unit/dependency-health.test.ts
sha256: 2492a5572cc559c10f03d1545dc316e35b97c77997825358a51a9237973237f9
generated_at: 2026-11-08T06:42:26.288535+00:00
model: ollama:qwen3.8:27b
---

# src/modules/observability/tests/unit/dependency-health.test.ts

## Purpose

Unit test that pins the exact mapping from raw infrastructure states (Mongoose `readyState`, cache adapter state, queue adapter state) to the normalized four-word health vocabulary (`ready`, `connecting`, `unavailable`, `disabled`), and verifies the `overallStatus` fold that turns per-dependency states into a single service-level status. It exists because the contract suite can only assert that the payload *contains* the four words; this file locks down *which* raw state produces *which* word, including the two easily-mixed cases (`disabled` must not degrade, `connecting` must not read as broken).

## Key elements

- **`withReadyState(state: number)`** — local helper that overrides `connection.readyState` via `Object.defineProperty` without opening a database connection.
- **`health(overrides?: Partial<DependencyHealth>)`** — helper that returns an all-`ready` `DependencyHealth` object, spread-merged with caller overrides, for composing fold tests.
- **`describe('dependencyHealth')`** — verifies the per-dependency reading: Mongoose state → word table (1→ready, 2→connecting, 0→unavailable, 3→unavailable, 99→unavailable), and that cache/queue states are delegated to their respective adapters rather than probed.
- **`describe('overallStatus')`** — verifies the fold: all-ready → `ok`; any `disabled` → still `ok`; any `connecting` or `unavailable` → `degraded`.
- **Mocks** — `cacheState` and `queueState` are `jest.mock`-ed factory functions; `connection` is *not* mocked (it is the real import, with only `readyState` redefined per test).

## Relationships

- **`src/modules/observability/services/dependency-health.ts`** — the system under test; imports `dependencyHealth`, `overallStatus`, and the `DependencyHealth` type.
- **`src/infrastructure/adapters/cache.ts`** — source of the mocked `cacheState` function.
- **`src/infrastructure/adapters/queue.ts`** — source of the mocked `queueState` function.
- **`src/infrastructure/runtime/database.ts`** — source of the real `connection` object whose `readyState` property is overridden per-test.

## Notes

- Mongoose `readyState` 3 (`disconnecting`) maps to `unavailable`, **not** `connecting`. The test documents this explicitly: a node heading out must not read as nearly-ready.
- Unknown future Mongoose states (e.g. 99) must resolve to `unavailable` — the "safe direction" that degrades a healthy service rather than reporting a dead one as serving.
- `disabled` on an optional dependency (cache, queue) keeps `overallStatus` at `ok`. This is called out as the single most important invariant: deployments that intentionally omit Redis or RabbitMQ must not show a permanent red.
- `connecting` is a distinct *word* from `unavailable` (legibility during a start-up grace period) but collapses to the same *status* (`degraded`) — an instance that cannot yet answer must not claim it can.
- The database `connection` is imported for real and mutated via `defineProperty`, not replaced with a mock. This keeps the test tied to the actual object shape while avoiding a live connection.
