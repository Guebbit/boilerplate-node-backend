---
source: src/modules/observability/tests/unit/dependency-health.test.ts
source_sha256: 7f596ba3cb573714779fb99e202f3b4d3413b69dc9c5d24225e89d413dccecac
context_sha256: a0601930f921eb829ee091087cd097048bcd2824c69d52ca62bf8d7ab36df718
generated_at: 2026-11-22T06:04:36.963747+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/observability/tests/unit/dependency-health.test.ts

## Purpose
Unit tests that pin the readiness "fold" in `services/dependency-health` with every dependency's state controlled. The contract suite can only check that the payload uses the four state words, since the actual values depend on the runner's `.env`. This file fixes the mapping itself, including two easy-to-invert cases: `disabled` must not degrade a service, and `connecting` must not read as broken.

## Key elements
- **`mockedCacheState` / `mockedQueueState`**: typed Jest mocks of `cacheState` and `queueState`. Each case picks the adapter state.
- **`withReadyState(state)`**: overrides `connection.readyState` with `Object.defineProperty` (`configurable: true`), so no database is opened.
- **`beforeEach`**: clears mocks, sets cache and queue to `'ready'`, and sets `readyState` to `1`.
- **`health(overrides)`**: builds a `DependencyHealth` with all dependencies `ready`, minus the overrides.
- **`describe('dependencyHealth')`**:
  - Maps mongoose readyState `1→ready`, `2→connecting`, `0→unavailable`, `3→unavailable`. State 3 (`disconnecting`) is not `connecting` because it is on its way out.
  - Maps an unknown state (`99`) to `unavailable` instead of crashing.
  - Checks that cache and queue states come straight from the adapters' own state functions.
- **`describe('overallStatus')`**:
  - `ok` when everything is ready.
  - `ok` when cache and queue are `disabled`, since a deployment without Redis or RabbitMQ is supported.
  - `degraded` when the cache is `unavailable` or `connecting`. This guards against a status that reads only the database.
  - `degraded` when the database is `connecting`.
  - `degraded` when only the queue is `unavailable`.

## Relationships
- Tests `dependencyHealth`, `overallStatus` and the `DependencyHealth` type from `src/modules/observability/services/dependency-health.ts`.
- Replaces `cacheState` from `src/infrastructure/adapters/cache.ts` and `queueState` from `src/infrastructure/adapters/queue.ts` with Jest mocks.
- Imports the real `connection` from `src/infrastructure/runtime/database.ts` and overrides only its `readyState`.
- The controller `src/modules/observability/controllers/get-observability-health.ts` is not imported here. The header comment's "contract suite" is the separate layer that checks the payload shape.

## Notes
- Unknown database states deliberately fall to `unavailable`. The comment says this degrades a healthy service rather than reporting a dead one as serving.
- `connecting` is a distinct word from `unavailable`, so a deploy in its start-up grace period is legible. Both give `degraded` status.
- `readyState` is redefined on the shared `connection` object, and `beforeEach` resets it to `1`.
