---
source: src/modules/account/controllers/get-refresh-token.ts
sha256: c0f1f48a6c37ca3dce40ef0e207aefba18d369c660ceedeea10329c5f7ba816d
generated_at: 2026-10-14T14:35:42.806789+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/controllers/get-refresh-token.ts

## Purpose

Thin HTTP adapter for `POST /account/refresh`. Reads the refresh-token cookie, delegates to `accountService.refreshAccessToken`, writes the rotated cookies and new access token back on the response. Exists solely to translate between the Express request/response cycle and the domain service call.

## Key elements

- **`getRefreshToken(request, response)`** — the sole export. Guard clause rejects with 404 in `cookie` mode. Otherwise reads the session cookie, calls `refreshAccessToken`, sets the rotated session + logged cookies, emits a success or failure response, and increments the `authRefreshTotal` metric.

## Relationships

- **`src/modules/account/services/index.ts`** — calls `accountService.refreshAccessToken(refreshToken, callerContext)`, which returns `{ accessToken, refreshToken, refreshMaxAgeMs }`.
- **`src/modules/account/session/cookies.ts`** — uses `createSessionCookie` (rotated token) and `createLoggedCookie` to set response cookies in the same exchange.
- **`src/modules/account/session/config.ts`** — reads `getSessionMode()` to short-circuit in `cookie` mode.
- **`src/modules/account/metrics.ts`** — increments `authRefreshTotal` with `status: 'success'` or `'failure'`.
- **`src/infrastructure/http/response.ts`** — `successResponse` / `rejectResponse` shape every HTTP reply.
- **`src/infrastructure/http/errors.ts`** — `isInfrastructureError` distinguishes retryable outages (→ 503) from token refusals (→ 401).
- **`src/infrastructure/http/request.ts`** — `callerContextOf(request)` extracts metadata passed into the service.
- **`src/kernel/cookies.ts`** — `readSessionCookie(request)` extracts the raw refresh token from the request.
- **`src/types/index.ts`** — `RefreshTokenResponse` type for the success payload.
- **`src/modules/account/routes.ts`** — registers this handler on the `POST /account/refresh` route (consumer side).

## Notes

- **Rotation is atomic with the response.** The new refresh cookie is written in the same response that returns the new access token; the client never holds the old value.
- **Uniform 401 for all token refusals.** Unknown, expired, revoked, and replayed tokens all yield the identical response so the client cannot distinguish them.
- **503 vs 401 is intentional.** An infrastructure failure maps to a retryable 503; the client treats 401 as a definitive sign-out, so outages must not be conflated with it.
- **No logging dependency here.** This file does not import the logger; any observability comes through the `authRefreshTotal` metric and the downstream service.
