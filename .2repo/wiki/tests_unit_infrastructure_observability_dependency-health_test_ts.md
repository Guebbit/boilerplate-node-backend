# tests/unit/infrastructure/observability/dependency-health.test.ts

## Purpose

Unit tests that pin the exact mapping from each dependency's raw state to its health word and the fold from individual words to an overall service status (`ok` / `degraded`). The contract suite elsewhere can only assert that the payload uses the four allowed words; this file locks *which* word each state produces and *when* the service degrades, covering two mappings that are easy to invert (`disabled` must not degrade, `connecting` must not read as broken).

## Key elements

- **`dependencyHealth` tests** — verify the reading: Mongoose `readyState` 0/1/2/3 and unknown values map to `unavailable`/`ready`/`connecting`/`unavailable`/`unavailable` respectively; cache and queue states are read from their adapters rather than probed directly.
- **`overallStatus` tests** — verify the fold: all-ready → `ok`; any `disabled` (cache or queue) → still `ok`; any `connecting` or `unavailable` → `degraded`.
- **`withReadyState(state)`** (local helper) — sets `connection.readyState` via `Object.defineProperty` so Mongoose connection logic never runs.
- **`health(overrides)`** (local helper) — builds a `DependencyHealth` with all three deps at `'ready'`, spread-overridable per test case.
- **`mockedCacheState` / `mockedQueueState`** — `jest.fn()` mocks injected via `jest.mock`, cleared and defaulted to `'ready'` in `beforeEach`.

## Relationships

- **`src/infrastructure/observability/dependency-health.ts`** — the module under test; supplies `dependencyHealth`, `overallStatus`, and the `DependencyHealth` type.
- **`src/infrastructure/adapters/cache.ts`** — mocked entirely; its `cacheState` export is the only surface the test interacts with.
- **`src/infrastructure/adapters/queue.ts`** — mocked entirely; its `queueState` export is the only surface the test interacts with.
- **`src/infrastructure/runtime/database.ts`** — imports the real `connection` object and redefines its `readyState` property per test (no actual DB connection is opened).

## Notes

- Mongoose `readyState 3` is *disconnecting* (heading out), not *connecting* (heading in). The test deliberately maps it to `unavailable`; a comment in the file flags this as the most common inversion bug.
- `disabled` is treated as an *optional* dependency: a deployment without Redis or RabbitMQ is supported, not broken. The fold must return `ok` when the only non-ready dep is `disabled`.
- `connecting` is a distinct *word* (honest "not serving yet") but not a distinct *status* in the fold — it degrades, because an instance that cannot answer yet must not claim it can.
- Unknown future `readyState` values (e.g. 99) intentionally resolve to `unavailable`: the safe error direction degrades a healthy service rather than reporting a dead one as serving.
