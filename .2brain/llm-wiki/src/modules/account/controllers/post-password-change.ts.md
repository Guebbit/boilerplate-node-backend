---
source: src/modules/account/controllers/post-password-change.ts
generated_at: 2026-11-22T03:26:21.247952+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/controllers/post-password-change.ts

## Purpose
Express controller for `POST /account/password`. It is a thin HTTP adapter over `accountService.passwordChangeWithCurrent`: the caller changes their password by proving the current one, with no email round-trip (unlike the reset flow). The service revokes all other sessions, and this controller re-issues the caller's own session so they are not signed out of the tab they are using.

## Key elements
- `postPasswordChange(request, response)` (the only export) handles the request in this order:
  1. Reads the user `id` from `request.authContext!`, which the `isAuth` middleware guarantees.
  2. Validates the body with `parseBody(ChangePasswordBody, ...)`. A malformed body is a bad request, not a wrong password. On failure it increments the failure metric and returns.
  3. Takes a session snapshot with `sessionSnapshotOf(request, id)` **before** the change. The change purges every session, including this request's, and the re-mint has to continue the one it replaces.
  4. Calls `accountService.passwordChangeWithCurrent(id, currentPassword, password, passwordConfirm, callerContextOf(request))`.
  5. If `refused(response, result)` is true, it counts a failure and returns.
  6. Otherwise it calls `reissueSession(request, response, id, { amr: [AMR.password], snapshot })` and responds `200` with `successResponse<AuthTokens>`.
  7. Any other rejection goes to `rejectDatabaseError(response, 'postPasswordChange', error)` and counts a failure.

## Relationships
- `src/modules/account/services/index.ts`: supplies `accountService`, whose `passwordChangeWithCurrent` does the password write and the revoke of other sessions.
- `src/modules/account/session/session.ts`: supplies `sessionSnapshotOf` and `reissueSession`, which capture and re-mint the caller's session.
- `src/modules/account/domain/session-proof.ts`: supplies `AMR`; `AMR.password` is the authentication method recorded on the re-issued session.
- `src/infrastructure/http/controller.ts`: supplies `parseBody` and `refused`.
- `src/infrastructure/http/request.ts`: supplies `callerContextOf`.
- `src/infrastructure/http/response.ts`: supplies `successResponse`.
- `src/infrastructure/http/errors.ts`: supplies `rejectDatabaseError`.
- `src/infrastructure/adapters/logger.ts`: used for a `warn` when the re-mint fails.
- `src/modules/account/metrics.ts`: `authPasswordChangeTotal` is incremented with `status: 'success'` or `'failure'`.
- `src/types/index.ts`: the `@types` import supplies `ChangePasswordRequest` and `AuthTokens`.
- `src/modules/account/routes.ts` (the neighbor that wires this handler) is not imported here. No import of `src/modules/account/session/strategy.ts` is visible in this file.

## Notes
- **A failed re-mint still returns 200.** By then the password write and the revoke have already succeeded. A 500 would wrongly tell the caller the change failed. Instead the controller logs a warning (`'Password changed, but the session re-mint failed.'`), counts a success, and responds `200` with an empty body (`{}`), so the response carries no new tokens.
- Schema validation (`ChangePasswordBody`, imported from `@api/schemas.zod`) covers only field presence and bounds. The service checks the rest, such as the repeat matching the new password.
- The handler returns a promise chain rather than using `async/await`. The early returns on validation failure and refusal return `undefined`.
