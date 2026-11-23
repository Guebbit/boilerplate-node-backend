---
source: src/modules/account/controllers/delete-session.ts
source_sha256: 88cd152c147a6f051fcde172eebc40c203611c954dbea61cb0d684a2ff953e3e
context_sha256: db83cb3f3b37d142ad79ce9936680da2915bb5512e6d5b7bf2a6c1de9ffa751a
generated_at: 2026-11-22T03:20:47.407049+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/controllers/delete-session.ts

## Purpose
Express controller for `DELETE /account/sessions/:sessionId`. It is a thin HTTP adapter that lets an authenticated user revoke one of their own sessions ("log out that device") by delegating to `accountService.sessionRevoke`.

## Key elements
- `deleteSession(request, response)` — the only export. Flow:
  1. Reads the caller's `id` from `request.authContext!` (non-null assertion; relies on the `isAuth` middleware).
  2. Validates `:sessionId` with `requireId`, using the `account.sessions.not-found` i18n key. If invalid, `requireId` handles the response and the controller returns.
  3. Calls `accountService.sessionRevoke(id, sessionId, sessionCredentialOf(request), callerContextOf(request))`.
  4. If `revoked` is false, responds 404 via `rejectResponse` with the translated `account.sessions.not-found` message.
  5. If `current` is true, calls `destroySessionCookie(response)`.
  6. Sends `noContentResponse` (204).
  7. Errors go through `.catch(catchAs(response, 'deleteSession'))`.

## Relationships
- `@infrastructure/http/ids` (`requireId`): validates the path param and emits the 404 for malformed ids.
- `@infrastructure/http/request` (`callerContextOf`): builds the caller context passed to the service.
- `@infrastructure/http/response` (`noContentResponse`, `rejectResponse`): produce the 204 and 404 responses.
- `@infrastructure/http/controller` (`catchAs`): error handler for the promise chain.
- `@infrastructure/i18n` (`t`): translates the not-found message.
- `../services` (`accountService`): `sessionRevoke` does the actual revocation and reports `{ revoked, current }`.
- `../session/session` (`sessionCredentialOf`): extracts the current request's session credential so the service can tell whether the revoked session is the current one.
- `../session/cookies` (`destroySessionCookie`): clears the session cookies when the current session was revoked.
- `../routes` (`src/modules/account/routes.ts`): registers this controller for the route.

## Notes
- A session id belonging to another user, a pending reset/delete/verify token id, a nonexistent id and a malformed id all return the same 404, so the endpoint doesn't reveal which ids exist.
- Revoking the current session behaves like `POST /account/logout`, cookies cleared included. Revoking another device clears no cookies, since they live in that device's browser.
