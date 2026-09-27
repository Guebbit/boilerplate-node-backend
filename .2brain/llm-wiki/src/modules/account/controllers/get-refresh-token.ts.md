---
source: src/modules/account/controllers/get-refresh-token.ts
sha256: d8b58dd093a692ea1e614e9731a3ad3244ea63b6f2eee64f757e1d1fb924a721
generated_at: 2026-09-27T14:23:27.447648+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/controllers/get-refresh-token.ts

## Purpose

HTTP controller for `GET /account/refresh`. It reads the refresh token from a cookie, conditionally runs a housekeeping sweep of expired tokens, then calls `accountService.refreshAccessToken` to mint a new short-lived access token **and** rotate the refresh token. The rotated refresh value is written back into the client's cookie in the same response.

## Key elements

- **`getRefreshToken(request, response)`** — sole export; the full request handler.
  - Reads the refresh token via `readRefreshCookie` (cookie-only; the token is never accepted from the URL or body).
  - Conditionally runs `runTokenCleanup()` *only* when a cookie is present, so anonymous requests cannot trigger a collection-wide DB sweep.
  - Calls `accountService.refreshAccessToken(refreshToken, callerContextOf(request))`.
  - On success: sets the rotated refresh cookie (`createRefreshCookie`) and a session "logged" cookie (`createLoggedCookie`), increments `authRefreshTotal` (`status: 'success'`), and returns the new access token via `successResponse<RefreshTokenResponse>`.
  - On auth failure: increments `authRefreshTotal` (`status: 'failure'`) and responds **401** via `rejectResponse`.
  - On cleanup failure: logs the error and responds via `rejectDatabaseError` (isolated so a routine maintenance failure doesn't surface as a 500 on an otherwise valid refresh).

## Relationships

- **`src/modules/account/services/index.ts`** — source of `accountService.refreshAccessToken` and `runTokenCleanup`; the core business logic lives here, not in this file.
- **`src/modules/account/session/cookies.ts`** — provides `createRefreshCookie` and `createLoggedCookie` used to set response cookies.
- **`src/kernel/cookies.ts`** — provides `readRefreshCookie` for extracting the token from the request.
- **`src/modules/account/metrics.ts`** — exports the `authRefreshTotal` counter incremented on both success and failure paths.
- **`src/infrastructure/http/response.ts`** — `successResponse` / `rejectResponse` shape the HTTP replies.
- **`src/infrastructure/http/errors.ts`** — `rejectDatabaseError` handles the cleanup-failure branch.
- **`src/infrastructure/http/request.ts`** — `callerContextOf` extracts caller metadata passed into the service call.
- **`src/infrastructure/adapters/logger.ts`** — `logger.error` is called when the cleanup sweep rejects.
- **`src/modules/account/routes.ts`** — upstream router that wires `GET /account/refresh` to this handler (not a direct import in this file).
- **`src/types/index.ts`** — defines the `RefreshTokenResponse` shape returned to the client.

## Notes

- **Token rotation is mandatory.** The rotated refresh value replaces the client's cookie in the *same* response. If this is skipped, the client keeps presenting the superseded token and relies on a grace window on the next refresh.
- **Cleanup is intentionally decoupled from auth.** Its rejection is caught in a separate `.catch` so a failed sweep doesn't turn a valid refresh into a 500. The auth rejection (401) and the cleanup rejection (500) are distinct code paths.
- **Cookie-only by design.** The file's docblock explicitly states the refresh token must not appear in the URL to avoid leaking into browser history, proxy logs, and `Referer` headers.
- **Cleanup guard.** `runTokenCleanup()` is only invoked when a refresh cookie actually exists; otherwise a `Promise.resolve()` is used to skip the DB work entirely.
