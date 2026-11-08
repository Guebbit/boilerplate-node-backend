---
source: src/modules/observability/services/dependency-health.ts
sha256: 2087e193f59a5d60e9dabfea9d77bc8950d45e4e375a2f565d40a22d2369a43a
generated_at: 2026-11-08T06:40:44.748806+00:00
model: ollama:qwen3.8:27b
---

# src/modules/observability/services/dependency-health.ts

## Purpose

Provides a **readiness** snapshot of the three backing services (database, cache, queue) by reading their already-tracked in-memory state — zero I/O. Serves `GET /observability/health` and is explicitly kept separate from the liveness endpoint (`GET /`) that drives the orchestrator's restart decision, so a degraded Redis reports as degraded without killing a healthy container.

## Key elements

- **`DependencyHealth`** (interface) — the payload shape: `{ database, cache, queue }`, each typed as `DependencyStatus`.
- **`DATABASE_STATES`** (const map) — translates Mongoose `readyState` integers (0–3) into the shared `DependencyStatus` vocabulary.
- **`dependencyHealth()`** (exported function) — returns a `DependencyHealth` by reading `connection.readyState`, calling `cacheState()`, and calling `queueState()`. Pure memory read; no network or disk.
- **`overallStatus(dependencies)`** (exported function) — pure fold over the three statuses; returns `'ok'` only if every status is `'ready'` or `'disabled'`, otherwise `'degraded'`. Accepts the map as a parameter so it stays testable without touching any adapter.

## Relationships

- **Imports from `src/infrastructure/runtime/database.ts`** — reads `connection.readyState` (Mongoose connection object).
- **Imports from `src/infrastructure/adapters/cache.ts`** — calls `cacheState()` to get the cache's current `DependencyStatus`.
- **Imports from `src/infrastructure/adapters/queue.ts`** — calls `queueState()` for the queue's current `DependencyStatus`.
- **Imports from `src/infrastructure/adapters/managed-connection.ts`** — uses the `DependencyStatus` type as the shared vocabulary across all three backends.
- **`src/modules/observability/services/index.ts`** — barrel file in the same directory; expected re-export surface for the observability service layer.
- **`src/modules/observability/tests/unit/dependency-health.test.ts`** / **`dependency-up.test.ts`** — unit tests covering the state-mapping and overall-status logic.

## Notes

- `readyState 3` (Mongoose "disconnecting") maps to `'unavailable'`, **not** `'connecting'`. Rationale: a disconnecting connection is on its way out and will not resume serving, so treating it as "nearly ready" would misreport a shutdown as a startup.
- `'disabled'` is treated as a passing status in `overallStatus`, meaning a dependency can be intentionally turned off (e.g., cache disabled in a minimal deployment) without degrading the overall health.
- The `dependencyHealth()` function performs **no I/O whatsoever** — it never pings, queries, or waits. Each adapter is responsible for keeping its own state current; this file only reads.
