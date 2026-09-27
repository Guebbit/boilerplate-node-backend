---
source: src/modules/observability/services/dependency-health.ts
sha256: 2087e193f59a5d60e9dabfea9d77bc8950d45e4e375a2f565d40a22d2369a43a
generated_at: 2026-09-27T15:05:01.288721+00:00
model: ollama:qwen3.8:27b
---

# src/modules/observability/services/dependency-health.ts

## Purpose

Readiness (not liveness) reporter for every backing service this process depends on — database, cache, queue. It performs a synchronous memory read of each adapter's already-tracked state and folds the result into a single `ok` / `degraded` verdict. It backs `GET /observability/health` and is explicitly designed to **never** feed the orchestrator's restart decision (that is `GET /` / liveness's job), so a degraded Redis degrades the dashboard dot instead of killing a healthy container.

## Key elements

- **`DependencyHealth`** (interface) — the payload shape: `{ database, cache, queue }`, each typed as `DependencyStatus`.
- **`DATABASE_STATES`** (const, module-private) — maps Mongoose `readyState` integers (0–3) to `DependencyStatus` strings. State `3` (`disconnecting`) intentionally maps to `'unavailable'`, not `'connecting'`.
- **`dependencyHealth()`** (exported function) — returns a fresh `DependencyHealth` object by reading `connection.readyState`, `cacheState()`, and `queueState()`. No I/O.
- **`overallStatus(dependencies)`** (exported pure function) — collapses a `DependencyHealth` into `'ok'` (every value is `'ready'` or `'disabled'`) or `'degraded'`. Binary by design: which specific dependency is down is the map's job, not the summary's.

## Relationships

- **`src/infrastructure/adapters/cache.ts`** — source of `cacheState()`; dependency-health calls it to read the cache adapter's current `DependencyStatus`.
- **`src/infrastructure/adapters/queue.ts`** — source of `queueState()`; same pattern as cache.
- **`src/infrastructure/runtime/database.ts`** — source of `connection` (a Mongoose connection); dependency-health reads `connection.readyState` directly.
- **`src/infrastructure/adapters/managed-connection.ts`** — defines the `DependencyStatus` type used throughout this file's interface and function signatures.
- **`src/modules/observability/services/health.ts`** — the liveness endpoint that coexists with this file's readiness endpoint; the two are intentionally decoupled so that a dependency failure here does not trigger a container restart.
- **`src/modules/observability/services/index.ts`** — barrel that re-exports this module's public API to the rest of the service.
- **`src/modules/observability/tests/unit/dependency-health.test.ts`** — unit tests covering the state mapping and `overallStatus` folding logic.

## Notes

- **Readiness ≠ liveness.** This file's output must never be wired into the orchestrator's restart probe. If you find it referenced in a liveness handler, that is a bug.
- **`'disabled'` counts as healthy.** `overallStatus` treats `'disabled'` the same as `'ready'`, so an optional cache/queue that is intentionally off won't produce a false-degraded signal.
- **Database state 3 is a deliberate choice.** Mongoose's `disconnecting` is mapped to `'unavailable'` (not `'connecting'`) because the connection is heading *out*; reporting it as "nearly ready" would misrepresent a shutdown as a startup.
- **No I/O by contract.** The function is a pure memory read. Adding a network call (e.g., `PING`) would violate the design intent documented in the module header.
