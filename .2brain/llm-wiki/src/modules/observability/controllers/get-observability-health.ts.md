---
source: src/modules/observability/controllers/get-observability-health.ts
sha256: 1b7b5eda6465d7048f960ec2bba520ba0bd9b990c866f49e1448f44aaaadf0f8
generated_at: 2026-10-29T04:35:07.103938+00:00
model: ollama:qwen3.8:27b
---

# src/modules/observability/controllers/get-observability-health.ts

## Purpose

Express controller for `GET /observability/health`, the detailed authenticated readiness endpoint. It contains no business logic — it delegates the entire payload construction to the observability service and only wires the result into an HTTP response (or error response).

## Key elements

- **`getObservabilityHealth`** — The sole export. An Express handler that calls `observabilityService.buildObservabilityHealth()`, sends the result via `successResponse<ObservabilityHealth>`, and routes any rejection through `catchAs`. The request parameter is unused (prefixed `_`).

## Relationships

- **`src/infrastructure/http/response.ts`** — Supplies `successResponse`, which serializes the typed payload onto the Express response.
- **`src/infrastructure/http/controller.ts`** — Supplies `catchAs`, the shared error-capture helper used in the `.catch` branch.
- **`src/modules/observability/services/index.ts`** — Exports `observabilityService`; this controller calls its `buildObservabilityHealth()` method for the entire payload.
- **`src/modules/observability/routes.ts`** — Presumably registers `getObservabilityHealth` on the `/observability/health` path.
- **`src/types/index.ts`** — Source of the `ObservabilityHealth` type used to type the response body.
- **`src/modules/observability/tests/unit/dependency-health.test.ts`** — Unit tests targeting the dependency-health logic that this endpoint ultimately exposes (tests live against the service layer, not this controller).

## Notes

- The module JSDoc intentionally distinguishes this endpoint from two others: `GET /readyz` (unauthenticated binary load-balancer probe) and `GET /livez` (liveness). They are separate routes because an orchestrator acting on liveness would restart the process without fixing the underlying dependency (e.g. a downed Redis).
- This file is deliberately thin. If you need to understand what "healthy" means or what fields are returned, look at `services/health.ts` (referenced in the header comment) rather than this controller.
