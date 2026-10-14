---
source: src/modules/account/controllers/delete-session.ts
sha256: eeae787a3286c642bd86f0a2d8977fed9aeae10009c8d2b31fc91b7ff5fbbf9a
generated_at: 2026-10-14T14:35:22.611215+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/controllers/delete-session.ts

## Purpose

Thin HTTP adapter for `DELETE /account/sessions/:sessionId`. Translates an authenticated request into a call to `accountService.sessionRevoke`, then shapes the JSON response (200 on success, 404 when the session is not the caller's or the ID is malformed). Exists so that revoking a specific device from "active sessions" is a first-class endpoint rather than a side-effect of a generic logout.

## Key elements

- **`deleteSession(request, response)`** — The sole export. Express handler that:
  1. Reads the authenticated user ID from `request.authContext` (guaranteed by upstream `isAuth` middleware).
  2. Validates the `:sessionId` param via `requireId`; short-circuits with a 404 if malformed.
  3. Calls `accountService.sessionRevoke(id, sessionId, sessionCredentialOf(request), callerContextOf(request))`.
  4. On success: if the revoked session is the *current* one, destroys the session and "logged-in" cookies on the response; then returns a 200 with an i18n'd message.
  5. On failure (not found): returns 404 with a generic `account.sessions.not-found` message.
  6. Catches unexpected errors via `catchAs`.

## Relationships

- **`@infrastructure/http/controller`** — `catchAs` provides the uniform error-to-HTTP mapping.
- **`@infrastructure/http/ids`** — `requireId` validates and extracts the `sessionId` path param, returning `undefined` (and writing a 404) when invalid.
- **`@infrastructure/http/request`** — `callerContextOf` extracts the caller's context (IP, UA, etc.) passed to the service.
- **`@infrastructure/http/response`** — `successResponse` / `rejectResponse` shape the JSON envelope.
- **`@infrastructure/i18n`** — `t()` localizes the success and not-found messages.
- **`../services`** — `accountService.sessionRevoke` performs the actual revocation; the controller is pure transport.
- **`../session/cookies`** — `destroySessionCookie` / `destroyLoggedCookie` are called only when the *current* session is revoked, clearing the caller's own cookies.
- **`../session/session`** — `sessionCredentialOf` pulls the current session token from the request to identify "current" vs. "another device."
- **`routes.ts`** — Registers this handler on the `DELETE /account/sessions/:sessionId` route (graph-adjacent).

## Notes

- **No info-leak on bad IDs.** A foreign session ID, a pending reset/verify token ID, or a malformed ID all produce the identical 404 body — the controller and service deliberately conflate these cases.
- **Current-session revocation = logout.** When `current` is true, the controller clears the session and logged-in cookies in addition to returning 200. Revoking *another* device's session clears no cookies (they live in that other browser).
- **Auth is not applied here.** `request.authContext` is accessed with a non-null assertion; the `isAuth` middleware (defined in `routes.ts`) is responsible for populating it before this handler runs.
- **No request body expected.** The operation is fully determined by the path param and the authenticated identity.
