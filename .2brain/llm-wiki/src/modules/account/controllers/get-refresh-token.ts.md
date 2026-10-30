---
source: src/modules/account/controllers/get-refresh-token.ts
sha256: 5b65699dcd5c2d13d3f92d59321a318bff21c9d00e8db2c4965d3945a6e82cd9
generated_at: 2026-10-29T02:27:34.117127+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/controllers/get-refresh-token.ts

## Purpose

HTTP handler for `POST /account/refresh`. A thin adapter that exchanges a refresh cookie for a new short-lived access token and simultaneously rotates the refresh cookie. Only active in `jwt` session mode; returns 404 in `cookie` mode.

## Key elements

- **`getRefreshToken(request, response)`** — The sole export. Reads the refresh cookie, calls `accountService.refreshAccessToken`, sets the rotated cookie on the response, and returns the new access token. Handles three failure paths: infrastructure outage (503), idle-session timeout (401 + `SESSION_IDLE` code), and all other token rejections (bare 401).

## Relationships

- **`src/modules/account/services/index.ts`** — Calls `accountService.refreshAccessToken(refreshToken, callerContext)` for the actual token mint + rotation logic.
- **`src/modules/account/session/cookies.ts`** — Calls `createSessionCookie(response, rotated, refreshMaxAgeMs)` to write the new refresh cookie into the same response.
- **`src/modules/account/session/config.ts`** — Calls `getSessionMode()` to short-circuit with 404 when the session is cookie-mode.
- **`src/modules/account/session/jwt.ts`** — Catches `TokenRejection` to distinguish idle-timeout rejections from other failures.
- **`src/kernel/cookies.ts`** — Calls `readSessionCookie(request)` to extract the refresh token from the incoming request.
- **`src/modules/account/metrics.ts`** — Increments `authRefreshTotal` with a `success` or `failure` label.
- **`src/infrastructure/http/response.ts`** — Uses `successResponse` / `rejectResponse` for all HTTP output.
- **`src/infrastructure/http/errors.ts`** — Uses `isInfrastructureError` to branch to a 503, and `rejectServiceUnavailable` for that path.
- **`src/infrastructure/http/request.ts`** — Calls `callerContextOf(request)` to build the context passed to the service.
- **`src/infrastructure/i18n/index.ts`** — Calls `t('account.session-idle')` for the localized idle-timeout message.
- **`src/types/index.ts`** — References `RefreshTokenResponse` as the success payload type.
- **`src/modules/account/routes.ts`** — Registers this handler on the `POST /account/refresh` route.

## Notes

- **Rotation is mandatory in-band.** The rotated refresh token is set on the *same* response as the new access token. Without this, the client would keep presenting a superseded token and depend on a grace window.
- **Deliberate ambiguity on 401.** Unknown, expired, revoked, and replayed tokens all produce an identical bare 401 so a client cannot fingerprint which state it hit.
- **503 ≠ 401.** Infrastructure errors return 503 (retryable) because the client treats 401 as a definitive sign-out.
- **Cookie-only transport.** The refresh token travels exclusively via an `HttpOnly` cookie to avoid exposure through browser history, proxy logs, and `Referer` headers.
- **No logger import.** This file does not log directly; observability is delegated to the service layer and the metrics counter.
