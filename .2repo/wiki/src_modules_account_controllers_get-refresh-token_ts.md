# src/modules/account/controllers/get-refresh-token.ts

## Purpose

Express route handler for `GET /account/refresh`. Reads the refresh token from the `jwt` `HttpOnly` cookie, conditionally triggers a collection-wide expired-token sweep, then delegates to `accountService.refreshAccessToken` to mint a new short-lived access token. Cookie-only by design so the refresh token never appears in URLs, proxy logs, or `Referer` headers.

## Key elements

- **`getRefreshToken(request, response)`** (sole export) — the HTTP adapter. Reads `request.cookies.jwt`, runs `runTokenCleanup()` (skipped if no cookie is present), then calls `accountService.refreshAccessToken(refreshToken, callerContextOf(request))`. Returns `200 { token }` on success, `401` on refresh failure, or a database-error response if the cleanup sweep itself rejects.
- **Metrics** — increments `authRefreshTotal` with `{ status: 'success' | 'failure' }` around the refresh call.
- **Error separation** — the `.catch` chain distinguishes cleanup failures (logged + `rejectDatabaseError`) from refresh failures (silent 401).

## Relationships

- **`src/modules/account/services/index.ts`** — re-exports `accountService` and `runTokenCleanup`; this controller is the HTTP layer above both.
- **`src/modules/account/services/token-cleanup.ts`** — implements `runTokenCleanup` (the expired-token sweep that runs before every authenticated refresh).
- **`src/modules/account/routes.ts`** — registers `getRefreshToken` as the handler for `GET /account/refresh`.
- **`src/modules/account/metrics.ts`** — provides `authRefreshTotal` counter.
- **`src/infrastructure/http/response.ts`** — `successResponse` / `rejectResponse` shape the JSON replies.
- **`src/infrastructure/http/errors.ts`** — `rejectDatabaseError` formats 5xx database-failure responses.
- **`src/infrastructure/adapters/logger.ts`** — structured error logging for cleanup failures.
- **`src/infrastructure/http/request.ts`** — `callerContextOf` extracts client context (IP, user-agent, etc.) passed into the service.
- **`src/modules/account/tests/unit/token-cleanup.test.ts`** — unit tests for the cleanup step that this controller invokes before delegating to the service.

## Notes

- The cookie name is the literal string `'jwt'`, set during post-login (see `post-login.ts`); changing one without the other breaks refresh silently.
- `runTokenCleanup` is intentionally **skipped** when the cookie is absent — running a collection-wide sweep for an anonymous request would let unauthenticated traffic schedule database work.
- The outer `.catch` exists specifically so a routine maintenance failure (e.g., a transient DB timeout during the sweep) returns a 500 with context rather than escaping to the global error handler; the refresh outcome itself is independent of cleanup success.
