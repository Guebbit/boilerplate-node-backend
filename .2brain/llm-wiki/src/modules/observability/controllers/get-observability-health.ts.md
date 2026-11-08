---
source: src/modules/observability/controllers/get-observability-health.ts
sha256: 1b7b5eda6465d7048f960ec2bba520ba0bd9b990c866f49e1448f44aaaadf0f8
generated_at: 2026-11-08T06:38:37.582890+00:00
model: ollama:qwen3.8:27b
---

# src/modules/observability/controllers/get-observability-health.ts

## Purpose

HTTP controller for `GET /observability/health`. It delegates payload construction to the observability service and shapes the resulting `ObservabilityHealth` object into a standard success response. It intentionally keeps no business logic of its own.

## Key elements

- **`getObservabilityHealth(_request, response)`** — Exported Express handler. Calls `observabilityService.buildObservabilityHealth()`, wraps the result via `successResponse<ObservabilityHealth>`, and funnels any rejection into `catchAs(response, 'getObservabilityHealth')`.

## Relationships

- **`@infrastructure/http/response`** — `successResponse` formats the 200 JSON envelope.
- **`@infrastructure/http/controller`** — `catchAs` provides the unified error-to-HTTP mapping on rejection.
- **`../services` (observability service barrel)** — Source of `observabilityService.buildObservabilityHealth()`, which actually assembles the readiness/dependency data.
- **`@types`** — Supplies the `ObservabilityHealth` type used as the response generic.
- **`src/modules/observability/routes.ts`** — Registers this handler on the `/observability/health` route.
- **`src/modules/observability/tests/unit/dependency-health.test.ts`** — Unit tests covering the dependency-health data this endpoint returns.

## Notes

- Three distinct health endpoints exist on purpose: this one (detailed, authenticated readiness), `GET /readyz` (binary, unauthenticated, load-balancer probe), and `GET /livez` (liveness). The JSDoc explicitly warns that an orchestrator restart triggered by liveness failure would not recover a downed Redis, so the endpoints must not be conflated.
- The file contains no branching or business logic; if the health shape changes, edit the service, not this controller.
