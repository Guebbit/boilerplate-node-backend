---
source: src/modules/account/controllers/post-logout.ts
sha256: a306099c8d74b487107257496dfa3130c1e3e8b7e1ed7d5d11d0b1485e07fe6a
generated_at: 2026-09-27T14:25:07.631874+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/controllers/post-logout.ts

## Purpose

Thin HTTP adapter for `POST /account/logout`. It logs out **only the current session** by revoking the refresh token associated with the caller's cookie and clearing the session cookies. Other devices remain signed in. The endpoint always responds 200 — a missing or already-revoked token is treated as "already logged out," not an error.

## Key elements

- **`postLogout`** (exported) — Express handler. Reads the refresh cookie, delegates to `accountService.logoutCurrentSession`, destroys both the refresh and "logged" cookies on the response, and sends a localized 200 success message. Errors are funnelled through `catchAs`.

## Relationships

- **`src/modules/account/services/index.ts`** — provides `accountService.logoutCurrentSession(refreshToken, callerContext)`, the business logic that revokes the token.
- **`src/modules/account/session/cookies.ts`** — provides `destroyRefreshCookie` and `destroyLoggedCookie`, the cookie-clearing helpers applied to the response.
- **`src/kernel/cookies.ts`** — provides `readRefreshCookie(request)` to extract the refresh token from the incoming request.
- **`src/infrastructure/http/controller.ts`** — provides `catchAs(response, tag)` for uniform async error handling.
- **`src/infrastructure/http/request.ts`** — provides `callerContextOf(request)` to derive the caller context passed to the service.
- **`src/infrastructure/http/response.ts`** — provides `successResponse` for the standardized 200 JSON reply.
- **`src/infrastructure/i18n/index.ts`** — provides `t()` for the success message (`account.logout.success`).
- **`src/modules/account/routes.ts`** — registers `postLogout` on the `POST /account/logout` route.

## Notes

- **Always 200.** There is intentionally no 4xx/5xx path for a missing or already-revoked refresh cookie. Callers (e.g. a "log out" button) should not branch on status code.
- **No bearer token required.** The refresh cookie is both the credential *and* the address (same convention as `GET /account/refresh`); the service uses it to locate and revoke the correct session.
- **Scope is per-session, not per-account.** Revoking the current refresh token does not invalidate tokens on other devices.
