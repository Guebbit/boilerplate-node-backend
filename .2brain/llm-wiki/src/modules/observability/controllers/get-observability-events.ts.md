---
source: src/modules/observability/controllers/get-observability-events.ts
source_sha256: 1eab0da4b10ac97f9edb9815fb5f047c5c96ee7b54129e9dbcaffd2dd2cce2b5
context_sha256: c7f5e73a8c266c17d37eb772215a936d7c65e8413a31c3b9e0e233c9c28f3a23
generated_at: 2026-11-22T06:00:40.340150+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/observability/controllers/get-observability-events.ts

## Purpose
Express controller for `GET /observability/events`. It opens the Server-Sent Events stream for observability metrics and wires the stream's periodic permission recheck to the same cookie-based authorization that admitted the request. The stream itself lives in the observability service.

## Key elements
- `getObservabilityEvents(request, response)`: the exported handler.
  - Reads `request.authContext`, which the cookie permission middleware is expected to have set. If it is absent, the handler fails closed with a 401 `UNAUTHORIZED` response via `rejectResponse`. The message is localized with `t('generic.error-unauthorized')`.
  - Otherwise it calls `observabilityService.streamObservabilityMetrics(response, user.id, recheck)`.
  - The `recheck` callback is `() => stillHoldsRuleViaCookie(request, 'read', 'ObservabilitySnapshot')`.

## Relationships
- `src/kernel/middlewares/authorizations.ts`: provides `stillHoldsRuleViaCookie`, used as the recheck. The file's comments say `requirePermissionViaCookie` runs before this handler and leaves the caller's context on the request.
- `src/modules/observability/services/index.ts`: exports `observabilityService`, whose `streamObservabilityMetrics` method this handler calls to run the stream.
- `src/infrastructure/http/response.ts`: provides `rejectResponse` for the 401 reply.
- `src/infrastructure/i18n/index.ts`: provides `t` for the error message. `src/infrastructure/i18n/context.ts` is a graph neighbor, but this file does not use it directly.
- `src/modules/observability/routes.ts`: mounts this handler on the route.
- `src/modules/observability/tests/unit/get-observability-events.test.ts`: unit tests for this controller.

## Notes
- The route is not behind `isAuth`, so `authContext` is read without a non-null assertion. A missing value is treated as unauthenticated.
- The doc comment says the permission is rechecked every 30 seconds while the stream is open. A revoked caller keeps the stream until a recheck ends it, because no further request is made. The interval itself is not set in this file.
