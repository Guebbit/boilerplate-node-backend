---
source: src/modules/observability/controllers/get-observability-health.ts
sha256: 584ec989f336d1a09b6858abe23374a904e46d8a2d844fefd1d8d51ab9d16a7c
generated_at: 2026-09-27T15:03:57.489224+00:00
model: ollama:qwen3.8:27b
---

# src/modules/observability/controllers/get-observability-health.ts

## Purpose

Thin HTTP controller for `GET /observability/health`. It exists solely to call the readiness builder in the service layer and wrap the result (or error) in the project's standard response helpers. All health-gathering logic lives in `services/health.ts`; this file adds no business logic.

## Key elements

- **`getObservabilityHealth`** (exported) — Express handler. Calls `buildObservabilityHealth()`, sends the resolved `ObservabilityHealth` payload via `successResponse`, and routes any rejection through `catchAs`.

## Relationships

- **`src/modules/observability/services/health.ts`** — Source of the actual readiness data; this controller's only domain dependency.
- **`src/infrastructure/http/response.ts`** — Provides `successResponse`, the project's standard 200 envelope.
- **`src/infrastructure/http/controller.ts`** — Provides `catchAs`, the project's standard error-catch helper.
- **`src/types/index.ts`** — Supplies the `ObservabilityHealth` type used for the response payload.
- **`src/modules/observability/routes.ts`** — Wires `getObservabilityHealth` to the `GET /observability/health` route.
- **`src/modules/observability/tests/unit/dependency-health.test.ts`** — Unit tests exercising the health-building path this controller delegates to.

## Notes

- The module JSDoc (and the function JSDoc) deliberately document the distinction between **three** endpoints: `/observability/health` (authenticated, detailed readiness), `/readyz` (binary, unauthenticated orchestrator probe), and `/` (liveness). The split exists so that an orchestrator's liveness-based restart doesn't mask a downed backing service (e.g. Redis).
- The handler is a plain async function, not a class method, consistent with the project's controller style.
- See `docs/modules/observability.md` (referenced in the module doc) for the broader design rationale.
