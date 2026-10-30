---
source: src/modules/observability/controllers/get-observability-events.ts
sha256: f6cf5a1ecbba52e9e1a75b6967e68fe46cef56446a165bbab472f974b7222233
generated_at: 2026-10-29T04:34:58.657469+00:00
model: ollama:qwen3.8:27b
---

# src/modules/observability/controllers/get-observability-events.ts

## Purpose

Controller handler for `GET /observability/events`. It opens a Server-Sent Events (SSE) stream and attaches a periodic permission recheck (every 30 s) to the same cookie that originally authorized the connection, so a revoked caller's stream is terminated on the next recheck cycle.

## Key elements

- **`getObservabilityEvents(request, response)`** — exported Express handler. Delegates to `observabilityService.streamObservabilityMetrics`, passing a recheck callback that calls `stillHoldsRuleViaCookie(request, 'read', 'ObservabilitySnapshot')`.

## Relationships

- **`src/modules/observability/routes.ts`** — registers this handler as the route for `GET /observability/events`.
- **`src/modules/observability/services/index.ts`** — provides `observabilityService.streamObservabilityMetrics`, which owns the actual SSE loop and the 30-second recheck cadence.
- **`src/kernel/middlewares/authorizations.ts`** — provides `stillHoldsRuleViaCookie`, the function invoked each cycle to confirm the caller still holds the `read` rule on `ObservabilitySnapshot`.
- **`src/modules/observability/tests/unit/get-observability-events.test.ts`** — unit tests for this handler.

## Notes

- The 30-second recheck is the **only** path in the codebase where a revoked caller retains access past their "next request," because an SSE stream has no subsequent request until the recheck fires.
- The handler assumes `requirePermissionViaCookie` middleware has already resolved a rule-holding caller and left its recheck context on the request; the handler itself performs no initial authorization.
- The permission rule is hardcoded to `'read'` / `'ObservabilitySnapshot'`; changing this requires a code edit, not config.
