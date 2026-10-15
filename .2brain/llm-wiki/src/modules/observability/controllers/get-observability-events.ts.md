---
source: src/modules/observability/controllers/get-observability-events.ts
sha256: fe34ed6af14797f15c1b3085630f1462fdb6dcf8c765e1f6f4dc7e7eaf126386
generated_at: 2026-10-15T10:54:26.124307+00:00
model: ollama:qwen3.8:27b
---

# src/modules/observability/controllers/get-observability-events.ts

## Purpose

Express controller for `GET /observability/events`. Opens the SSE metrics stream and attaches a periodic (30 s) permission recheck so that a revoked caller is disconnected mid-stream rather than on their next request (which never comes).

## Key elements

- **`OBSERVABILITY_READ_KEY`** (exported constant) — `'platform.observability.any.read'`. The single permission key guarding every route in the observability module. Exported here (not from `routes.ts`) because this handler needs the key's *value* to pass into the recheck callback, not just a guard built from it.
- **`getObservabilityEvents`** (exported handler) — Receives `Request`/`Response`, calls `streamObservabilityMetrics(response, recheckFn)`. The `recheckFn` delegates to `stillHoldsKeyViaCookie(request, OBSERVABILITY_READ_KEY)`.

## Relationships

- **`src/kernel/middlewares/authorizations.ts`** — Imports `stillHoldsKeyViaCookie` for the periodic recheck. The upstream `requirePermissionViaCookie` middleware has already resolved a key-holding caller before this handler executes.
- **`src/modules/observability/routes.ts`** — Registers this handler on the `/observability/events` route. `routes.ts` references the permission key as a guard but imports the constant from *this* file.
- **`src/modules/observability/services/stream.ts`** — Provides `streamObservabilityMetrics`, the actual SSE stream writer that this handler invokes.
- **`src/modules/observability/tests/unit/get-observability-events.test.ts`** — Unit tests for this controller.

## Notes

- The 30-second recheck is the **only** place in the codebase where a revoked caller does not lose access on the "next request," because no next request exists while the stream is open — the recheck itself terminates the stream if the key no longer resolves.
- `requirePermissionViaCookie` (in `authorizations.ts`) is expected to have already left its recheck on the request object; this handler assumes that precondition and never re-validates the initial authorization.
