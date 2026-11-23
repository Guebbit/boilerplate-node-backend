---
source: src/modules/observability/services/dependency-health.ts
source_sha256: 6fc083c1cc5992ba2b96e038e51f27641028c5e3e8ee987095d019ef1769337a
context_sha256: 8654c5bbe836cdf35c1e2c54815f9a924f362664b2a20acb7c0fb7468587317c
generated_at: 2026-11-22T06:02:49.676797+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/observability/services/dependency-health.ts

## Purpose
Reports the current readiness of every backing service (database, cache, queue) in one shared vocabulary. It backs `GET /observability/health` and is deliberately separate from liveness (`GET /livez`), so a degraded dependency never triggers a container restart. It does no I/O: each dependency already tracks its own state, so this only reads memory.

## Key elements
- `DependencyHealth` — interface with `database`, `cache` and `queue` fields, each a `DependencyStatus`.
- `DATABASE_STATES` (internal) — maps Mongoose `readyState` integers to `DependencyStatus`: `0` → `unavailable`, `1` → `ready`, `2` → `connecting`, `3` → `unavailable`.
- `dependencyHealth()` — returns a `DependencyHealth` snapshot. The database state comes from `connection.readyState`, and an unmapped value falls back to `unavailable`. The cache and queue states come from `cacheState()` and `queueState()`.
- `overallStatus(dependencies)` — pure function that returns `'ok'` if every status is `ready` or `disabled`, and `'degraded'` otherwise.

## Relationships
- `src/infrastructure/runtime/database.ts` — supplies `connection`, whose `readyState` is read.
- `src/infrastructure/adapters/cache.ts` and `src/infrastructure/adapters/queue.ts` — supply `cacheState()` and `queueState()`.
- `src/infrastructure/adapters/managed-connection.ts` — defines the `DependencyStatus` type shared by all three backends (type-only import).
- `src/modules/observability/services/health.ts` and `src/modules/observability/metrics.ts` are graph neighbors, but this file does not import them.
- Tests: `src/modules/observability/tests/unit/dependency-health.test.ts` and `src/modules/observability/tests/unit/dependency-up.test.ts`.

## Notes
- `disabled` counts as healthy in `overallStatus`, so an intentionally turned-off dependency does not make the overall status `degraded`.
- `disconnecting` (Mongoose state `3`) is mapped to `unavailable` rather than `connecting`, so a shutdown is not reported as a startup.
- `overallStatus` returns only `ok` or `degraded`. The per-dependency map says which part is missing.
- Do not use this for liveness or restart decisions.
