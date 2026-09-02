# src/modules/account/controllers/get-refresh-token.ts

## Purpose

Thin HTTP adapter for `GET /account/refresh`. It reads the refresh token from the `jwt` cookie, optionally runs a collection-wide expired-token sweep, then calls `accountService.refreshAccessToken` to mint a new short-lived access token **and** rotate the refresh cookie in the same response. Cookie-only by design—no token ever appears in the URL, query string, or `Referer` header.

## Key elements

- **`getRefreshToken(request, response)`** — the sole export. Reads `request.cookies.jwt`, conditionally runs `runTokenCleanup()`, then calls `accountService.refreshAccessToken(refreshToken, callerContextOf(request))`. On success it sets a rotated refresh cookie, a "logged-in" cookie, increments the `success` metric, and returns `{ token: accessToken }`. On auth failure it increments the `failure` metric and returns `401`.

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/modules/account/services/index.ts` | Imports `accountService` (for `refreshAccessToken`) and `runTokenCleanup`. |
| `src/modules/account/services/token-cleanup.ts` | Provides `runTokenCleanup` (re-exported via `services/index`); called before the refresh to purge expired tokens. |
| `src/modules/account/session/cookies.ts` | `createRefreshCookie` writes the rotated token back as an `HttpOnly` cookie; `createLoggedCookie` sets the secondary session marker. |
| `src/modules/account/metrics.ts` | `authRefreshTotal.inc({ status: 'success' \| 'failure' })` records every refresh attempt. |
| `src/infrastructure/http/response.ts` | `successResponse` / `rejectResponse` shape the JSON replies. |
| `src/infrastructure/http/errors.ts` | `rejectDatabaseError` handles the (rare) case where the cleanup sweep itself throws. |
| `src/infrastructure/http/request.ts` | `callerContextOf(request)` extracts identity/context forwarded to the service layer. |
| `src/infrastructure/adapters/logger.ts` | `logger.error` logs cleanup failures so they don't surface to the client. |
| `src/modules/account/routes.ts` | Wires this handler to the `GET /account/refresh` route. |
| `src/modules/account/tests/unit/token-cleanup.test.ts` | Unit-tests `runTokenCleanup`, the sweep this controller triggers. |

## Notes

- **Cookie name is `'jwt'`**, decided in `post-login.ts`. Don't rename it here without updating that file.
- **Rotation is mandatory:** every successful refresh replaces the refresh token's value. The old value is superseded immediately; the client must use the new cookie going forward.
- **Cleanup is conditional:** `runTokenCleanup()` is skipped when the cookie is absent, preventing anonymous traffic from scheduling a collection-wide DB sweep.
- **Cleanup failure is non-fatal to the refresh:** a `.catch` on the cleanup promise logs the error and returns a database-error response, but it does *not* let the rejection bubble into the global handler as a `500` on an otherwise valid request.
- **Grace window:** because the rotated cookie is delivered in the same response, there is a brief window where the old token is still valid. The service layer handles that; the controller does not.
