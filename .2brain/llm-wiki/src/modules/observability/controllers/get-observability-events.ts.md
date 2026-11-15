---
source: src/modules/observability/controllers/get-observability-events.ts
sha256: 7f32d395b3b7202a9a40bdc5dfbf446df9c6409439d38d1007bf57b1413b1665
generated_at: 2026-11-14T20:28:29.617319+00:00
model: ollama:qwen3.8:27b
---

# src/modules/observability/controllers/get-observability-events.ts

## Purpose

Controller for `GET /observability/events`. It validates that the request carries an authenticated user (set by the authorization middleware, not `isAuth`), then hands the Express response to the observability service to open a Server-Sent Events stream. A permission recheck is wired into the stream so a revoked caller's SSE connection is terminated even though no subsequent HTTP request will trigger a fresh authorization check.

## Key elements

- **`getObservabilityEvents`** (exported) – Express handler. Reads `request.authContext`; returns a 401 `rejectResponse` if absent. Otherwise calls `observabilityService.streamObservabilityMetrics(response, user.id, callback)` where the callback is an inline arrow function that invokes `stillHoldsRuleViaCookie(request, 'read', 'ObservabilitySnapshot')`.

## Relationships

- **`src/modules/observability/routes.ts`** – Registers `getObservabilityEvents` as the handler for the `GET /observability/events` route.
- **`src/modules/observability/services/index.ts`** – Provides `observabilityService`, whose `streamObservabilityMetrics` method owns the actual SSE lifecycle.
- **`src/kernel/middlewares/authorizations.ts`** – Supplies `stillHoldsRuleViaCookie`, imported and invoked inside the stream's periodic recheck (every 30 s per the doc comment).
- **`src/infrastructure/http/response.ts`** – Provides `rejectResponse` used for the 401 path.
- **`src/infrastructure/i18n/index.ts` / `context.ts`** – Provide the `t` translation function for the error message string.
- **`src/modules/observability/tests/unit/get-observability-events.test.ts`** – Unit tests for this handler.

## Notes

- The route is **not** behind `isAuth`; it relies on `requirePermissionViaCookie` having set `request.authContext`. The handler treats a missing `authContext` as a hard 401 (fail-closed), so the `!` non-null assertion is deliberately avoided.
- The 30-second permission recheck is the **only** mechanism that can revoke an open SSE connection mid-stream. A revoked caller does not lose access on "their next request" because no next request occurs until the stream ends — the recheck itself ends it.
- The permission rule checked is `read` on `ObservabilitySnapshot`, matching the rule the upstream middleware originally validated.
