# src/modules/account/controllers/get-refresh-token.ts

## Purpose
Express route handler for `GET /account/refresh`. It reads a refresh token from the `jwt` HttpOnly cookie, optionally triggers a collection-wide token-cleanup sweep, then exchanges the token for a new short-lived access token via `accountService.refreshAccessToken`. It exists so authenticated clients can rotate their access token without a full re-login.

## Key elements
- **`getRefreshToken(request, response)`** — sole export; the controller itself.
- Reads `request.cookies.jwt` as the only accepted refresh-token source.
- Conditionally calls `runTokenCleanup()` (skipped when the cookie is absent).
- Calls `accountService.refreshAccessToken(refreshToken, callerContextOf(request))`.
- Increments the `authRefreshTotal` Prometheus counter with `status: 'success' | 'failure'`.
- Replies via `successResponse`, `rejectResponse(401)`, or `rejectDatabaseError`.
- Logs cleanup failures through the structured `logger`.

## Relationships
- **`routes.ts`** — registers this handler at `GET /account/refresh`.
- **`services/index.ts`** — re-exports `accountService` and `runTokenCleanup`, both consumed here.
- **`services/token-cleanup.ts`** — implements the `runTokenCleanup` sweep this handler conditionally triggers.
- **`metrics.ts`** — exports the `authRefreshTotal` counter used for success/failure tagging.
- **`@infrastructure/http/request.ts`** — provides `callerContextOf(request)` to extract caller metadata for the service call.
- **`@infrastructure/http/response.ts`** — provides `successResponse` / `rejectResponse` helpers.
- **`@infrastructure/http/errors.ts`** — provides `rejectDatabaseError` used when the cleanup sweep throws.
- **`@infrastructure/adapters/logger.ts`** — structured logger for the cleanup-failure log line.
- **`tests/unit/token-cleanup.test.ts`** — unit-tests the cleanup logic this handler may invoke.

## Notes
- The cookie name is the literal string `jwt`, a convention set in `post-login.ts`; there is no shared constant imported here.
- `runTokenCleanup` is deliberately skipped when no cookie is present: it is a collection-wide DB sweep, and running it for anonymous traffic would let unauthenticated requests schedule database work.
- Cleanup rejection is caught *separately* from the refresh rejection so a routine maintenance failure doesn't surface as a 500 on a request that was already going to be answered. Without this catch the rejection would escape to the global Express error handler.
- The refresh token is read **only** from the `HttpOnly` cookie, never from query params or path segments, to avoid leaking it into browser history, proxy logs, and `Referer` headers.
