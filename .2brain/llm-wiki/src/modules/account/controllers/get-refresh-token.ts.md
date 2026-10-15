---
source: src/modules/account/controllers/get-refresh-token.ts
sha256: 980887514e923de4d891fbf20b2398226398a60c9b70fdcef07bcb8c0be8a711
generated_at: 2026-10-15T09:54:10.296534+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/controllers/get-refresh-token.ts

## Purpose

HTTP controller for `POST /account/refresh`. It is a thin adapter that reads the refresh-token cookie, calls `accountService.refreshAccessToken`, rotates the client's refresh cookie in the same response, and returns a fresh short-lived access token. It exists so that the refresh endpoint is cookie-only (no bearer token in headers) and so the token-rotation contract is enforced at the HTTP layer.

## Key elements

- **`getRefreshToken(request, response)`** – sole export. The full request handler:
  - Short-circuits with **404** when `getSessionMode()` is `'cookie'` (cookie mode has no rotating token to refresh).
  - Reads the refresh token via `readSessionCookie(request)`.
  - Delegates to `accountService.refreshAccessToken(refreshToken, callerContextOf(request))`.
  - On success: sets the rotated cookie with `createSessionCookie(response, rotated, refreshMaxAgeMs)`, increments `authRefreshTotal` (`status: 'success'`), and sends `{ token: accessToken }`.
  - On failure: if `isInfrastructureError(error)` → **503** (retryable); otherwise → **401** (definitive) and increments `authRefreshTotal` (`status: 'failure'`).

## Relationships

| Neighbor | Interaction |
|---|---|
| `modules/account/services/index.ts` | Calls `accountService.refreshAccessToken` for the token exchange. |
| `modules/account/session/cookies.ts` | Calls `createSessionCookie` to write the rotated cookie into the response. |
| `modules/account/session/config.ts` | Calls `getSessionMode()` to decide whether to 404. |
| `modules/account/metrics.ts` | Increments the `authRefreshTotal` counter on success and failure. |
| `modules/account/routes.ts` | Registers `getRefreshToken` as the handler for the `/account/refresh` POST route. |
| `infrastructure/http/response.ts` | Uses `successResponse` / `rejectResponse` for all HTTP replies. |
| `infrastructure/http/errors.ts` | Uses `isInfrastructureError` to branch 503 vs 401; uses `rejectServiceUnavailable` for the 503 path. |
| `infrastructure/http/request.ts` | Uses `callerContextOf(request)` to pass request metadata into the service call. |
| `kernel/cookies.ts` | Uses `readSessionCookie(request)` to extract the refresh token from the incoming cookie. |
| `types/index.ts` | Imports the `RefreshTokenResponse` shape for the success payload. |

## Notes

- **401 vs 503 is deliberate.** A 401 tells the client "you are signed out, stop retrying." A 503 says "try again later." Infrastructure outages must never collapse into 401, or the client will sign out during a blip.
- **Rotation is atomic with the response.** The new cookie is set in the *same* HTTP response that returns the new access token. If the client keeps the old cookie, the server's grace window must absorb the overlap; the controller's job is to avoid that situation.
- **No logging import.** This file does not import the module logger; any logging inside the request lifecycle is delegated to the service or infrastructure layers.
- **Single mode guard.** The `cookie`-mode 404 check happens *before* any cookie read or service call, so a cookie-mode deployment never touches the refresh path at all.
