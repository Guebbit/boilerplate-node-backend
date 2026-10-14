---
source: src/modules/account/controllers/post-logout.ts
sha256: 7bee4b1afa8a9580bcbef3f5fb8a8cc5ad5ab85b2537a78334a673a6c6dbc51d
generated_at: 2026-10-14T08:35:28.851940+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/controllers/post-logout.ts

## Purpose

Thin HTTP adapter that handles `POST /account/logout`. It delegates the actual logout to `accountService.logoutCurrentSession`, then clears the session and logged cookies. By design it always responds 200: a missing or already-revoked refresh cookie is treated as "not logged in here," not an error.

## Key elements

- **`postLogout(request, response)`** — The sole export. Reads the session credential from the request, calls `accountService.logoutCurrentSession(credential, callerContext)`, then destroys both cookies and sends a localized 200 success response. Errors are funneled through `catchAs`.

## Relationships

- **`src/modules/account/services/index.ts`** — Source of `accountService`; the controller calls `logoutCurrentSession` on it.
- **`src/modules/account/session/session.ts`** — Provides `sessionCredentialOf`, which extracts the refresh-token credential from the request.
- **`src/modules/account/session/cookies.ts`** — Provides `destroySessionCookie` and `destroyLoggedCookie`, used to clear cookies on the response.
- **`src/modules/account/routes.ts`** — Registers this controller on the `POST /account/logout` route.
- **`src/infrastructure/http/controller.ts`** — Provides `catchAs` for uniform error handling.
- **`src/infrastructure/http/request.ts`** — Provides `callerContextOf` to build the context passed to the service.
- **`src/infrastructure/http/response.ts`** — Provides `successResponse` for the 200 reply.
- **`src/infrastructure/i18n/index.ts`** (and its `context.ts`) — Provides the `t` function for the localized success message key `account.logout.success`.

## Notes

- The refresh cookie acts as **both** the credential and the session identifier (analogous to `POST /account/refresh`); no bearer token is involved.
- The controller intentionally never returns a non-200 for "not logged in" scenarios — the service layer resolves them as successful no-ops, and the cookies are cleared regardless.
- The `catchAs` handler is the only path to a non-200 response (true server errors).
