---
source: src/modules/account/controllers/post-logout.ts
sha256: a5a94c8edca7a38f23507426075ff0c6ff7e95c304dd975671e60ceedac6dd85
generated_at: 2026-10-15T09:55:41.864698+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/controllers/post-logout.ts

## Purpose

Thin HTTP adapter for `POST /account/logout`. It extracts the session credential from the request cookie, delegates to `accountService.logoutCurrentSession`, then clears the session cookie and returns a localized 200. The cookie acts as both credential and session address, so no bearer token is required.

## Key elements

- **`postLogout(request, response)`** — The sole export. Reads the credential via `sessionCredentialOf`, calls `accountService.logoutCurrentSession(credential, callerContextOf(request))`, then destroys the session cookie and sends `successResponse` with the `account.logout.success` i18n string. Errors are forwarded to `catchAs(response, 'postLogout')`.

## Relationships

- **`routes.ts`** — Registers this function as the handler for the `POST /account/logout` route.
- **`services/index.ts`** — Source of `accountService`; this controller calls `logoutCurrentSession` on it.
- **`session/session.ts`** — Provides `sessionCredentialOf(request)`, which extracts the refresh-cookie credential used as the logout target.
- **`session/cookies.ts`** — Provides `destroySessionCookie(response)`, invoked after successful logout.
- **`infrastructure/http/controller.ts`** — Provides the `catchAs` error-handling helper.
- **`infrastructure/http/request.ts`** — Provides `callerContextOf(request)`, passed to the service for logging/audit context.
- **`infrastructure/http/response.ts`** — Provides `successResponse` for the 200 reply.
- **`infrastructure/i18n/index.ts` / `context.ts`** — Provides the `t()` translation function for the success message.

## Notes

- **Always 200.** A missing or already-revoked cookie is treated as "not logged in here" and still yields success — it is never an error condition.
- **Session-scoped only.** Revokes the token for the *current* session (identified by the cookie) and leaves other devices signed in.
- **No body expected or returned.** The credential arrives exclusively via the refresh cookie; the response body is `undefined` with a localized message.
