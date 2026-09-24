---
source: src/modules/observability/services/dependency-health.ts
sha256: 8b86a48a7c413c48db7a3303c43f45eff44dbacb9459e23d8f96cc915b3ba6d3
generated_at: 2026-09-23T18:57:03.913202+00:00
model: ollama:qwen3.8:27b
---

# src/modules/observability/services/dependency-health.ts

## Purpose

Provides a **readiness** health snapshot of every backing service (database, cache, queue) by reading their already-tracked in-memory state. It powers `GET /observability/health` and is deliberately decoupled from the liveness check (`GET /`) that drives orchestrator restart decisions, so a degraded dependency reports degraded without killing a healthy container.

## Key elements

- **`DependencyHealth`** (interface) — the report shape: `{ database, cache, queue }`, each a `DependencyStatus`.
- **`DATABASE_STATES`** (const map) — translates Mongoose `readyState` integers (0–3) into `DependencyStatus` strings.
- **`dependencyHealth()`** — returns a `DependencyHealth` by reading `connection.readyState`, `cacheState()`, and `queueState()`. Pure memory read; performs no I/O.
- **`overallStatus(dependencies)`** — folds a `DependencyHealth` into `'ok' | 'degraded'`. A dependency counts as fine if it is `'ready'` **or** `'disabled'`; anything else yields `'degraded'`. Pure function (input passed in, not read internally).

## Relationships

- **`@infrastructure/runtime/database`** — imports `connection` to read `connection.readyState`.
- **`@infrastructure/adapters/cache`** — imports `cacheState()` for the cache reading.
- **`@infrastructure/adapters/queue`** — imports `queueState()` for the queue reading.
- **`@infrastructure/adapters/managed-connection`** — imports the `DependencyStatus` type (the shared vocabulary all three adapters report in).
- **`src/modules/observability/services/index.ts`** — barrel file that re-exports this module's public API.
- **`src/modules/observability/controllers/get-observability-health.ts`** — the HTTP controller that calls `dependencyHealth()` / `overallStatus()` to build the JSON response.
- **`src/modules/observability/tests/unit/dependency-health.test.ts`** — unit tests for the mapping logic and the `overallStatus` fold.

## Notes

- Mongoose `readyState 3` (`disconnecting`) is mapped to `'unavailable'`, **not** `'connecting'`. Rationale: the connection is on its way out and will not resume serving, so calling it "connecting" would misrepresent a shutdown as a startup.
- `overallStatus` treats `'disabled'` equivalently to `'ready'` — a deliberately switched-off dependency does not count as degraded.
- The file performs **no I/O**. All three adapters already maintain their state; this module only reads it. Do not add network calls or pings here.
- The file must never be used by the liveness endpoint (`GET /`) or any orchestrator restart logic.
