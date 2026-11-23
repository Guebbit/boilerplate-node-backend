---
source: src/modules/account/controllers/post-logout.ts
source_sha256: c0582bfe9a4b2b3859edcd3edb6f6ba05c3e3ee358102fd706d77839cb1028a3
context_sha256: b46b14463c0344825d04e0d10866e955017f16a1a8a40d04197641aa4c73801e
generated_at: 2026-11-22T03:25:51.652725+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/controllers/post-logout.ts

## Purpose
Express controller for `POST /account/logout`. It is a thin HTTP adapter over `accountService.logoutCurrentSession`. It logs out only the current session and leaves other devices signed in.

## Key elements
- `postLogout(request, response)` is the only export. It does the following:
  - Reads the session credential from the request with `sessionCredentialOf`.
  - Calls `accountService.logoutCurrentSession(credential, callerContextOf(request))`.
  - On success, clears the session cookie with `destroySessionCookie(response)` and sends `noContentResponse(response)`, which is a 204.
  - On failure, hands the error to `catchAs(response, 'postLogout')`.

## Relationships
- `src/modules/account/services/index.ts`: supplies `accountService`, which revokes the stored session token.
- `src/modules/account/session/session.ts`: `sessionCredentialOf` extracts the credential from the request.
- `src/modules/account/session/cookies.ts`: `destroySessionCookie` clears the session cookie on the response.
- `src/infrastructure/http/request.ts`: `callerContextOf` builds the caller context passed to the service.
- `src/infrastructure/http/response.ts`: `noContentResponse` sends the 204.
- `src/infrastructure/http/controller.ts`: `catchAs` is the shared error handler, tagged `'postLogout'`.
- `src/modules/account/routes.ts`: presumably mounts this handler on the logout route. That wiring is not visible in this file.

## Notes
- No bearer token is required. The refresh cookie is both the credential and the address of the session, as in `POST /account/refresh`.
- The endpoint is meant to always return 204 on success. A missing or already-revoked cookie means "not logged in here" and is not treated as an error.
- Cookies are cleared only inside `.then`. If the service call rejects, `catchAs` handles it and the cookie is not destroyed by this file.
- `sessionCredentialOf(request)` runs synchronously outside the promise chain, so a throw from it would not be caught by `.catch(catchAs(...))`.
