---
source: src/modules/account/controllers/post-logout-everywhere.ts
source_sha256: 0f627def526d341fbbf572f0b9a71fd4fc8f5bf54edf68793b749b1d8c53cf05
context_sha256: a130cebad299188282df9d3eb00a81c1796b9be2b5818aefe4ae6bcb48c4abbf
generated_at: 2026-11-22T03:25:45.203043+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/controllers/post-logout-everywhere.ts

## Purpose
HTTP controller for `DELETE /account/sessions`. It is a thin adapter that signs the caller out of every device by delegating to `accountService.logoutEverywhere`, then clears the caller's own refresh cookie and replies with no content.

## Key elements
- `postLogoutEverywhere(request, response)`: the Express handler (the only export).
  - Calls `accountService.logoutEverywhere(request.authContext!.id, callerContextOf(request))`.
  - If `result.success` is false, it sends `rejectResponse(response, result.status, result.errors)` and returns early.
  - On success it calls `destroySessionCookie(response)` and then `noContentResponse(response)`.
  - Any rejection goes to `.catch(catchAs(response, 'postLogoutEverywhere'))`.

## Relationships
- `src/infrastructure/http/controller.ts`: provides `catchAs`, which builds the error handler for the promise chain.
- `src/infrastructure/http/request.ts`: provides `callerContextOf`, which extracts the caller context passed to the service.
- `src/infrastructure/http/response.ts`: provides `rejectResponse` (error reply) and `noContentResponse` (success reply).
- `src/modules/account/services/index.ts`: provides `accountService`. Its `logoutEverywhere` does the actual revocation.
- `src/modules/account/session/cookies.ts`: provides `destroySessionCookie`, which removes the refresh cookie from the response.
- `src/modules/account/routes.ts`: the route file for the account module. It is the expected place where this handler is mounted for `DELETE /account/sessions`.

## Notes
- The handler assumes authentication middleware has already set `request.authContext`. It reads `authContext!.id` with a non-null assertion, so there is no check in this file.
- Per the in-code docs, `logoutEverywhere` removes all refresh tokens in the DB and moves the session epoch, so access tokens already issued stop working too.
- The caller is signed out as well. No new session or token is issued.
- A failed revocation is deliberately returned as an error and the cookie is not cleared. Otherwise the caller would think every device is logged out while a stolen one might still work.
