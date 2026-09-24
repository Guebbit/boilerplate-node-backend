---
source: src/modules/account/controllers/post-logout.ts
sha256: 51ea69c958f5d39e641f62e013e5293ef287342a5e955b7084539dc4e8c29b49
generated_at: 2026-09-23T18:02:50.196077+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/controllers/post-logout.ts

## Purpose

Thin HTTP adapter for `POST /account/logout`. It revokes the current session's refresh token, clears the session cookies, and always returns **200** — a missing or already-revoked token is treated as "not logged in here," not an error. Only the current session is affected; other devices remain signed in.

## Key elements

- **`postLogout`** (exported) — Express route handler. Reads the refresh token from `request.cookies.jwt`, calls `accountService.logoutCurrentSession(token, callerContext)`, then on success destroys both cookies via `destroyRefreshCookie` / `destroyLoggedCookie` and replies with `successResponse(200, t('account.logout.success'))`. Errors are delegated to `catchAs`.

## Relationships

- **`@infrastructure/http/controller`** → `catchAs`: unified error-catch helper used in the `.catch` branch.
- **`@infrastructure/http/request`** → `callerContextOf`: extracts caller metadata from the Express request, passed into the service call.
- **`@infrastructure/http/response`** → `successResponse`: formats the 200 JSON reply.
- **`@infrastructure/i18n`** → `t`: translates the success message (`account.logout.success`).
- **`../services`** → `accountService.logoutCurrentSession`: performs the actual token revocation; this controller adds no business logic.
- **`../session/cookies`** → `destroyRefreshCookie`, `destroyLoggedCookie`: set `maxAge=0` / clear-cookie headers on the two session cookies.
- **`../routes`** (account routes): registers `postLogout` on the `POST /account/logout` path.

## Notes

- The refresh cookie serves as **both credential and address** (same pattern as `GET /account/refresh`), so no bearer token header is required.
- The cookie key is literally `jwt` on `request.cookies` — it is _not_ an access token.
- Because the handler always resolves to 200, clients cannot distinguish "was logged in" from "was not logged in here." Callers should not rely on a non-2xx to detect an invalid session.
