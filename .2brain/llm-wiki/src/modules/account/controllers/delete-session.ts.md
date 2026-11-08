---
source: src/modules/account/controllers/delete-session.ts
sha256: 88cd152c147a6f051fcde172eebc40c203611c954dbea61cb0d684a2ff953e3e
generated_at: 2026-11-08T04:00:59.519472+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/controllers/delete-session.ts

## Purpose

Thin HTTP adapter for `DELETE /account/sessions/:sessionId`. Validates the caller's identity and the session-ID parameter, delegates the actual revocation to `accountService.sessionRevoke`, and emits either a `404` or a `204` response — clearing the session cookie only when the revoked session is the caller's current one.

## Key elements

- **`deleteSession`** (exported) — Express route handler. Extracts `id` from `request.authContext`, validates `sessionId` via `requireId`, calls `accountService.sessionRevoke(id, sessionId, credential, callerContext)`, then:
  - Responds `404` with an i18n message if `revoked` is falsy.
  - Calls `destroySessionCookie(response)` when `current` is true.
  - Responds `204 No Content` on success.
  - Catches rejections through `catchAs(response, 'deleteSession')`.

## Relationships

- **`src/modules/account/services/index.ts`** — Consumes `accountService.sessionRevoke`, the business-logic entry point this controller wraps.
- **`src/infrastructure/http/controller.ts`** — Provides `catchAs`, the standard error-to-HTTP mapping used in the `.catch` branch.
- **`src/infrastructure/http/ids.ts`** — Provides `requireId`, which parses and validates the `sessionId` URL parameter and sends `404` inline if invalid.
- **`src/infrastructure/http/request.ts`** — Provides `callerContextOf`, extracting the caller's IP/user-agent context for audit or rate-limiting downstream.
- **`src/infrastructure/http/response.ts`** — Provides `noContentResponse` (204) and `rejectResponse` (404) helpers.
- **`src/infrastructure/i18n/index.ts`** (and `context.ts`) — Provides `t()` for localizing the 404 error message key.
- **`src/modules/account/session/cookies.ts`** — Provides `destroySessionCookie` to clear the session cookie on the response when the current session is revoked.
- **`src/modules/account/session/session.ts`** — Provides `sessionCredentialOf`, extracting the credential (e.g. CSRF token or session token) from the request for the service call.
- **`src/modules/account/routes.ts`** — Registers `deleteSession` as the handler for the `DELETE /account/sessions/:sessionId` route.

## Notes

- Auth is **not** checked here; the non-null assertion `request.authContext!` relies on an upstream `isAuth` middleware guarantee.
- A session ID belonging to another user, a pending reset/delete/verify token, or a malformed ID all produce the same `404` — intentional to prevent session-ID enumeration.
- Revoking the *current* session is equivalent to `POST /account/logout` (cookie is cleared). Revoking another device's session does **not** touch any cookies, since those live in that device's browser.
