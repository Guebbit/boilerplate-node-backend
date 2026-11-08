---
source: src/modules/account/controllers/get-refresh-token.ts
sha256: 5689143efd485a3ab5de34f2d42e75e69bf27e29212681d9bce7892891744bea
generated_at: 2026-11-08T04:02:35.617518+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/controllers/get-refresh-token.ts

## Purpose

Thin HTTP adapter for `POST /account/refresh`. In `jwt` mode it exchanges the client's refresh cookie for a new short-lived access token **and** rotates the refresh cookie in the same response. In `cookie` mode the endpoint is meaningless (the single credential never rotates) and the controller returns 404.

## Key elements

- **`getRefreshToken(request, response)`** – sole export. Orchestrates the full refresh flow: mode check → cookie read → service call → abilities lookup → cookie rotation → JSON response.
- **Mode guard** – calls `getSessionMode()`; if `'cookie'`, immediately `rejectResponse(response, 404)` and returns.
- **Service delegation** – delegates to `accountService.refreshAccessToken(refreshToken, callerContextOf(request))`, which performs validation, rotation, and minting.
- **Abilities check** – after rotation, resolves `abilitiesOfUser(userId)`; a missing user throws `TokenRejection('revoked', …)` so the response is a plain 401.
- **Cookie rotation** – `createSessionCookie(response, rotated, refreshMaxAgeMs)` sets the new `HttpOnly` refresh cookie on the same response that delivers the new access token.
- **Metrics** – `authRefreshTotal.inc({ status: 'success' | 'failure' })` on every terminal path.
- **Error mapping** – three branches in the `.catch`:
  - `isInfrastructureError` → 503 via `rejectServiceUnavailable` (client should retry).
  - `TokenRejection` with `reason === 'idle'` → 401 with `ERROR_CODES.SESSION_IDLE` and i18n message.
  - All other rejections → bare 401 (no distinction between unknown, expired, revoked, or replayed).

## Relationships

- **`src/modules/account/services/index.ts`** – calls `accountService.refreshAccessToken`, the core token-validation-and-rotation logic.
- **`src/modules/account/session/cookies.ts`** – `createSessionCookie` writes the rotated refresh cookie onto the response.
- **`src/modules/account/session/config.ts`** – `getSessionMode` determines whether the endpoint is applicable at all.
- **`src/modules/account/session/jwt.ts`** – `TokenRejection` is the structured error type caught and inspected in the error handler.
- **`src/modules/account/session/account-view.ts`** – `abilitiesOfUser` provides the permission set returned in the response body.
- **`src/modules/account/metrics.ts`** – `authRefreshTotal` counter incremented on success and failure.
- **`src/modules/account/routes.ts`** – registers this handler on the `POST /account/refresh` route.
- **`src/kernel/cookies.ts`** – `readSessionCookie` extracts the refresh token from the inbound request.
- **`src/infrastructure/http/response.ts`** – `successResponse` / `rejectResponse` shape every outbound reply.
- **`src/infrastructure/http/errors.ts`** – `isInfrastructureError` / `rejectServiceUnavailable` classify and render outage errors.
- **`src/infrastructure/http/request.ts`** – `callerContextOf` passes request metadata (IP, user-agent, etc.) into the service.
- **`src/infrastructure/i18n/index.ts`** – `t()` localizes the idle-timeout message.
- **`src/types/index.ts`** – `RefreshTokenResponse` types the success body (`{ token, abilities }`).

## Notes

- **401 is deliberately opaque.** Unknown, expired, revoked, and replayed tokens all produce an identical bare 401 so a client cannot fingerprint which rejection occurred. The only exception is the `idle` reason, which carries a distinct `SESSION_IDLE` error code so the UI can say "signed out for inactivity."
- **503 vs 401 is a contract.** Clients treat 401 as a definitive sign-out and 503 as retryable; infrastructure failures must never be collapsed into 401.
- **Rotation is atomic with the response.** The new refresh cookie is set on the *same* response that delivers the new access token. If the client drops that response, the old cookie is already superseded server-side and the next attempt relies on the grace window.
- **Refresh token never appears in the body.** It lives exclusively in the `HttpOnly` cookie to avoid leakage through URL bars, proxy logs, or `Referer` headers. The JSON body carries only the short-lived access token and abilities.
