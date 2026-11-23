---
source: src/modules/account/controllers/post-reset-confirm.ts
source_sha256: 507001b2d6aff7a66fe6d5fa573a7a0dfe2d5b6b2aaaf50c539e251019ee8bfe
context_sha256: c3c88adf1172aa939e1460602c521ee056119bb76822c272bc4c7c12a0b82f69
generated_at: 2026-11-22T03:26:59.326680+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/controllers/post-reset-confirm.ts

## Purpose
Express controller for `POST /account/password/reset/confirm`. It validates the request body, asks the account service to spend the one-time reset token and set the new password, then responds with 204 No Content. The reset token comes from the link in the email sent to the user.

## Key elements
- `postResetConfirm(request, response)` is the only export.
  - It parses the body with `parseBody(ConfirmPasswordResetBody, ...)` and returns early if validation fails. `parseBody` handles the response in that case.
  - It destructures `token`, `password`, `passwordConfirm` and `termsAccepted` from the body.
  - It calls `accountService.completePasswordReset(token, password, passwordConfirm, callerContextOf(request), termsAccepted)`.
  - If `refused(response, result)` is true, it increments the failure metric and returns.
  - On success it increments the success metric, clears the session cookie with `destroySessionCookie`, and sends `noContentResponse`.
  - Any thrown error increments the failure metric and is passed to `catchAs(response, 'postResetConfirm')`.

## Relationships
- `src/modules/account/services/index.ts` (`accountService`): `completePasswordReset` does all the checks and the atomic spend of the token. A refused password therefore cannot burn the link.
- `src/infrastructure/http/controller.ts`: supplies `parseBody`, `refused` and `catchAs`, which handle validation, refusal responses and error mapping.
- `src/infrastructure/http/request.ts`: `callerContextOf` builds the caller context passed to the service.
- `src/infrastructure/http/response.ts`: `noContentResponse` sends the success response.
- `src/modules/account/session/cookies.ts`: `destroySessionCookie` clears the session cookie on success.
- `src/modules/account/metrics.ts`: `authPasswordResetConfirmTotal` counts outcomes with a `status` label of `success` or `failure`.
- `src/types/index.ts`: provides the `PasswordResetConfirmRequest` body type.
- `src/modules/account/routes.ts` is the neighbor that wires this handler to the route. The routing itself is not visible in this file.
- `src/infrastructure/adapters/logger.ts` is listed as a neighbor, but this file does not use it directly.

## Notes
- The handler returns a promise and does not use `async`/`await`. The early `return` after `parseBody` returns `undefined`.
- The session cookie is destroyed only on success. This suggests that a successful reset ends the current session, but the file does not state that.
- The route's `token` param is typed as optional (`{ token?: string }`). The token actually used comes from the validated body.
