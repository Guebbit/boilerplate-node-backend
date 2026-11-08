---
source: src/modules/observability/controllers/get-observability-events.ts
sha256: f6cf5a1ecbba52e9e1a75b6967e68fe46cef56446a165bbab472f974b7222233
generated_at: 2026-11-08T06:38:28.990348+00:00
model: ollama:qwen3.8:27b
---

# src/modules/observability/controllers/get-observability-events.ts

## Purpose

Express controller for `GET /observability/events`. It opens a Server-Sent Events (SSE) stream of observability metrics and attaches a periodic permission recheck (every 30 s) so a revoked caller loses access while the long-lived connection is still open. The actual streaming logic lives in the service layer; this file is a thin glue point between the route and the stream.

## Key elements

- **`getObservabilityEvents`** (exported) — The Express handler for `GET /observability/events`. Calls `observabilityService.streamObservabilityMetrics(response, recheckFn)` where `recheckFn` invokes `stillHoldsRuleViaCookie(request, 'read', 'ObservabilitySnapshot')`. No body parsing, no error handling beyond what the service provides.

## Relationships

- **`src/kernel/middlewares/authorizations.ts`** — Provides `stillHoldsRuleViaCookie`, used here as the recheck callback passed into the stream. The middleware that originally authorized the request (`requirePermissionViaCookie`) must have run upstream; this handler assumes it succeeded.
- **`src/modules/observability/services/index.ts`** — Source of `observabilityService`; its `streamObservabilityMetrics` method performs the actual SSE setup and calls the recheck callback on each 30-second tick.
- **`src/modules/observability/routes.ts`** — Registers `getObservabilityEvents` as the handler for the `/observability/events` route.
- **`src/modules/observability/tests/unit/get-observability-events.test.ts`** — Unit tests exercising this controller (mocks the service and the recheck function).

## Notes

- This is the **only** place in the codebase where access revocation is enforced on a persistent connection via a periodic recheck, because an SSE stream has no "next request" to trigger the usual per-request auth middleware.
- The recheck re-evaluates the **same cookie** that opened the stream; it does not mint or validate a new token.
- The handler performs **no initial authorization itself** — it relies entirely on the upstream middleware (`requirePermissionViaCookie`) having already resolved a rule-holding caller. If that middleware is bypassed, the recheck still runs but the initial grant is assumed.
