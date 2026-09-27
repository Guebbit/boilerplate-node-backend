---
source: src/modules/observability/controllers/get-observability-events.ts
sha256: a941d9a90829cc605de9c09a16aadcd847f7e612600a386d17f4d67413de9909
generated_at: 2026-09-27T15:03:48.774456+00:00
model: ollama:qwen3.8:27b
---

# src/modules/observability/controllers/get-observability-events.ts

## Purpose

Express handler for `GET /observability/events`. It opens the SSE (Server-Sent Events) stream for observability metrics and attaches a periodic permission recheck (every 30 s) so that a caller whose key is revoked mid-stream has the stream terminated proactively—since there is no subsequent HTTP request to re-trigger auth.

## Key elements

- **`OBSERVABILITY_READ_KEY`** (exported const) — the permission key `'platform.observability.any.read'`. Exported here rather than from `routes.ts` because this handler is the only place that needs the key's *value* (for the recheck callback), not just a guard built from it.
- **`getObservabilityEvents`** (exported handler) — Reads the caller's refresh token from the request cookie (guaranteed present by upstream `requirePermissionViaCookie`), then delegates to `streamObservabilityMetrics`, passing a callback that calls `stillHoldsKeyViaCookie` to verify the key is still held on each recheck tick.

## Relationships

- **`src/kernel/cookies.ts`** — imports `readRefreshCookie` to extract the caller's refresh token for the recheck.
- **`src/kernel/middlewares/authorizations.ts`** — imports `stillHoldsKeyViaCookie`, the function invoked every 30 s to confirm the caller still holds `OBSERVABILITY_READ_KEY`.
- **`src/modules/observability/services/stream.ts`** — imports `streamObservabilityMetrics`, which opens the SSE connection and periodically invokes the recheck callback supplied by this handler.
- **`src/modules/observability/routes.ts`** — mounts `getObservabilityEvents` as the `GET /observability/events` route.
- **`src/modules/observability/tests/unit/get-observability-events.test.ts`** — unit tests covering this handler.

## Notes

- The non-null assertion `readRefreshCookie(request)!` is intentional: upstream middleware (`requirePermissionViaCookie`) already guaranteed the cookie exists and is valid before this handler runs.
- This is the one code path where access revocation is handled *proactively* (stream ends after the recheck fails) rather than *reactively* (next 401 response). The 30-second window is the maximum a revoked caller can still receive events.
