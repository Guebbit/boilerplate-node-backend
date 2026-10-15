---
source: src/modules/observability/controllers/get-observability-health.ts
sha256: 8d43ba41f016ca896c18ca3503cfe2b43845868facd6f87a5cd5de42af329ab1
generated_at: 2026-10-15T10:54:33.800333+00:00
model: ollama:qwen3.8:27b
---

# src/modules/observability/controllers/get-observability-health.ts

## Purpose

Thin Express controller that wires the `GET /observability/health` route to the health-building service and shapes the HTTP response. All payload construction lives in the service layer; this file exists solely to bridge the HTTP boundary.

## Key elements

- **`getObservabilityHealth(_request, response)`** (exported const) — The sole export. Calls `buildObservabilityHealth()`, sends the result via `successResponse<ObservabilityHealth>`, and funnels rejections through `catchAs(response, 'getObservabilityHealth')`. The request parameter is intentionally unused (prefixed `_`).

## Relationships

- **`../services/health.ts`** — Provides `buildObservabilityHealth()`, the async function that assembles the full readiness payload. This controller is its only caller in the HTTP layer.
- **`@infrastructure/http/response`** — Supplies `successResponse`, the shared helper that serialises a 200 JSON envelope.
- **`@infrastructure/http/controller`** — Supplies `catchAs`, the shared error-serialisation helper that maps rejected promises to an error response.
- **`@types`** — Imports the `ObservabilityHealth` interface used to type the success payload.
- **`src/modules/observability/routes.ts`** — The route registration file that maps `GET /observability/health` to this controller (inferred from the module's single-purpose naming).

## Notes

- This endpoint is **readiness**, not liveness. The JSDoc explicitly distinguishes three endpoints: `/observability/health` (detailed, authenticated readiness), `/readyz` (binary LB probe, unauthenticated), and `/livez` (liveness). An orchestrator restarting on liveness would not recover a downed dependency, so the three are intentionally separate.
- The request parameter is unused; do not add request-reading logic here without first extending the service.
- Error handling is delegated entirely to `catchAs`; there is no local try/catch.
