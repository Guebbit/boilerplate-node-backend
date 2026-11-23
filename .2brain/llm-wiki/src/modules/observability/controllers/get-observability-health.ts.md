---
source: src/modules/observability/controllers/get-observability-health.ts
source_sha256: 3e9944adf8f11c0e5fc28649a582b45f3634b41be63f468341082a36a3fda727
context_sha256: fb9be26d75880ef78a6b1f17806133d76607937f3a001f2d1cd60b5b53fcbee9
generated_at: 2026-11-22T06:00:49.192971+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/observability/controllers/get-observability-health.ts

## Purpose
Express controller for `GET /observability/health`, the detailed, authenticated readiness view (backing services, telemetry wiring, process resources, per-job outcomes). It does not build the payload itself; it calls the observability service and shapes the HTTP response.

## Key elements
- `getObservabilityHealth(_request, response)` — the only export. Calls `observabilityService.buildObservabilityHealth()`, then on success sends the result with `successResponse<ObservabilityHealth>(response, health)`. Errors are routed through `catchAs(response, 'getObservabilityHealth')`. The request object is unused.

## Relationships
- `src/infrastructure/http/response.ts` — provides `successResponse`, used to send the health payload.
- `src/infrastructure/http/controller.ts` — provides `catchAs`, which handles rejected promises for this controller.
- `src/modules/observability/services/index.ts` — exports `observabilityService`, whose `buildObservabilityHealth()` produces the data.
- `src/types/index.ts` — supplies the `ObservabilityHealth` type (imported via the `@types` alias).
- `src/modules/observability/routes.ts` — the route layer that exposes this handler at `/observability/health`.
- `src/modules/observability/tests/unit/dependency-health.test.ts` — related test file in the module's unit tests.

## Notes
- Three separate endpoints exist on purpose: this one is detailed and authenticated. `GET /readyz` is the binary, unauthenticated probe for load balancers. `GET /livez` is liveness. The source explains that orchestrators restart on liveness failure, and restarting this process would not recover a downed Redis, so readiness and liveness are kept apart.
- The handler uses a promise chain, not `async/await`.
