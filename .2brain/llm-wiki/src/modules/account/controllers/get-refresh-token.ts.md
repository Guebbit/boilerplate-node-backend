---
source: src/modules/account/controllers/get-refresh-token.ts
sha256: 54f95367a2cdae183eb96517722231ca9f17133903c7e31a405f6f5a49c0585b
generated_at: 2026-09-23T18:00:54.767673+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/controllers/get-refresh-token.ts

## Purpose

Express controller for `GET /account/refresh`. It reads the refresh token from the `jwt` cookie, optionally runs a collection-wide token-cleanup sweep, then delegates to `accountService.refreshAccessToken` to mint a new access token and rotate the refresh cookie. It is a thin HTTP adapter: all business logic lives in the account service layer.

## Key elements

- **`getRefreshToken(request, response)`** — sole export. The full handler for the refresh endpoint. Reads the `jwt` cookie, conditionally runs `runTokenCleanup()`, calls `accountService.refreshAccessToken`, sets the rotated refresh + logged cookies, records the `authRefreshTotal` metric, and sends either a 200 (with the new access token) or a 401.

## Relationships

- **`src/modules/account/services/index.ts`** — source of `accountService.refreshAccessToken` and `runTokenCleanup`; the two calls that drive this controller.
- **`src/modules/account/services/token-cleanup.ts`** — implements the sweep that `runTokenCleanup` triggers; runs before the refresh and is intentionally fire-and-forget.
- **`src/modules/account/session/cookies.ts`** — provides `createRefreshCookie` and `createLoggedCookie`, used to set the rotated refresh cookie and the login-timestamp cookie on the response.
- **`src/modules/account/metrics.ts`** — exports `authRefreshTotal`, incremented with a `status` label (`success` / `failure`).
- **`src/infrastructure/http/response.ts`** — provides `successResponse` and `rejectResponse` for the 200 and 401 paths.
- **`src/infrastructure/http/errors.ts`** — provides `rejectDatabaseError`, used in the cleanup-failure catch to shape the 500 response.
- **`src/infrastructure/http/request.ts`** — provides `callerContextOf(request)` to pass caller metadata into the service call.
- **`src/infrastructure/adapters/logger.ts`** — `logger.error` records a non-fatal cleanup failure before delegating to `rejectDatabaseError`.
- **`src/types/index.ts`** — supplies the `RefreshTokenResponse` type that shapes the 200 body.
- **`src/modules/account/routes.ts`** — upstream neighbor that mounts this controller at `GET /account/refresh`.
- **`src/modules/account/tests/unit/token-cleanup.test.ts`** — unit-tests the cleanup logic this controller conditionally invokes.

## Notes

- **Cookie-only by design.** The refresh token is never placed in the URL, query string, or body; it is read exclusively from the `HttpOnly` `jwt` cookie to avoid leaking through browser history, proxy logs, or `Referer` headers.
- **Cleanup is conditional.** `runTokenCleanup()` is skipped entirely when the `jwt` cookie is absent, so anonymous traffic cannot schedule a database sweep.
- **Cleanup failure ≠ refresh failure.** The cleanup `.catch` is separate from the refresh `.catch`. A failed sweep logs an error and calls `rejectDatabaseError` (500) without conflating it with the 401 path of a bad/expired token.
- **Token rotation is atomic per response.** The rotated refresh value and the new access token are set in the same response; the client must not reuse the old refresh value.
- **Cookie name coupling.** The cookie is read as `cookies.jwt`; the name is decided in `post-login.ts`, not here.
- **Stryker suppression.** A `Stryker disable next-line all` comment guards the `logger.error` line from mutation testing, since removing it would not change observable HTTP behavior.
