---
source: src/modules/account/controllers/delete-account.ts
source_sha256: a4efdcee55544186a42427cb4a700c5a5d04317efd711e7d104d74e184bcc351
context_sha256: c66f9c5ab629ac98b28f15eb1a216389a3839173fad58dcc02aeb29ca2b13b23
generated_at: 2026-11-22T03:20:24.252146+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/controllers/delete-account.ts

## Purpose
Express controller for `DELETE /account`. The authenticated user locks their own account and schedules its erasure. It responds `202` with the request and purge dates and clears the session cookie, because the account's sessions are invalidated by the same write.

## Key elements
- `deleteAccount(request, response)` is the only export. It:
  1. Reads `id` from `request.authContext!`, which the `isAuth` middleware guarantees.
  2. Loads the user with `accountUserService.findAuthenticatableById(id)`.
  3. If no user is found, increments `authAccountDeleteTotal` with `status: 'failure'` and responds `401` via `rejectResponse`. A valid token whose row is gone or locked is treated as a dead session, not a server fault.
  4. Otherwise calls `accountService.scheduleAccountDeletion(user, callerContextOf(request))`.
  5. On success, calls `destroySessionCookie(response)` and `successResponse(..., 202)` with `{ requestedAt, purgeAt }` as ISO strings.
  6. Routes any rejection to `catchAs(response, 'deleteAccount')`.

## Relationships
- `src/modules/users/friends/account.ts`: provides `accountUserService`, used to look up the authenticatable user.
- `src/modules/account/services/index.ts`: provides `accountService`, whose `scheduleAccountDeletion` method does the actual scheduling.
- `src/modules/account/session/cookies.ts`: provides `destroySessionCookie`, which clears the session cookie.
- `src/infrastructure/http/response.ts`: provides `rejectResponse` and `successResponse`.
- `src/infrastructure/http/request.ts`: provides `callerContextOf`, which builds the caller context passed to the service.
- `src/infrastructure/http/controller.ts`: provides `catchAs`, the shared error handler.
- `src/modules/account/metrics.ts`: provides the `authAccountDeleteTotal` counter.
- `src/modules/account/routes.ts`: wires this controller to the route. The documented preconditions are `isAuth`, a critically fresh session and, with 2FA, an otp proof.

## Notes
- The failure metric is incremented only on the missing-user path in this file. Nothing here increments it on other failures, and no success counter is incremented either.
- The file does not check freshness or the otp proof itself. The JSDoc says these are required of the request, so they are presumably enforced by middleware configured in the routes.
