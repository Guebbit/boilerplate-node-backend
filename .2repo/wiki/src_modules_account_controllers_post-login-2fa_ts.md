# src/modules/account/controllers/post-login-2fa.ts

## Purpose
Controller for `POST /account/login/2fa`, the second step of two-factor authentication. It validates the request body, verifies the login challenge and OTP code against `accountService`, then issues a session with `amr: ['pwd', 'otp']`. It exists so that a login that was interrupted by `mfaRequired: true` can be completed in a single round-trip.

## Key elements
- **`postLoginTwoFactor(request, response)`** — the sole export. Validates the body with the `LoginTwoFactorBody` Zod schema, delegates to `accountService.verifyLoginChallenge(challenge, code, callerContextOf(request))`, and on success calls `issueSession` with the `['pwd', 'otp']` auth-method reference. Returns `{ token }` on 200.
- **Metrics** — every code path (validation failure, service failure, success, database error) increments the `authTwoFactorChallengeTotal` counter with the appropriate `status` label.
- **Observability** — on success, calls `recordLoginSuccess(request, userId, !!data.admin)` for audit/observability.

## Relationships
- **`src/modules/account/services/index.ts`** — calls `accountService.verifyLoginChallenge` to check the challenge + code.
- **`src/modules/account/session/session.ts`** — calls `issueSession(response, userId, undefined, ['pwd', 'otp'])` to mint the access token.
- **`src/modules/account/session/login-observability.ts`** — calls `recordLoginSuccess` after a verified login.
- **`src/modules/account/metrics.ts`** — increments `authTwoFactorChallengeTotal` on every outcome.
- **`src/infrastructure/http/response.ts`** — uses `successResponse` (200) and `rejectResponse` (service-level errors, defensive 500).
- **`src/infrastructure/http/controller.ts`** — uses `rejectValidation` for Zod parse failures.
- **`src/infrastructure/http/errors.ts`** — uses `rejectDatabaseError` in the `.catch` handler.
- **`src/infrastructure/http/request.ts`** — uses `callerContextOf(request)` to extract caller metadata for the service call.
- **`src/types/index.ts`** — imports the `LoginTwoFactorRequest` type used in the Express `Request` generic.
- **`src/modules/account/routes.ts`** — the account module's route table that wires `POST /login/2fa` to this handler.

## Notes
- The `amr` array `['pwd', 'otp']` is load-bearing: downstream auth guards that require a second factor read it from the session. Changing or omitting an element will silently break those guards.
- A defensive `data === undefined` check after `result.success` is true exists to guard against a malformed service return; it maps to a bare 500 with no error detail.
- The handler uses a `.then()/.catch()` chain rather than `async/await`, consistent with the project's Express controller style.
- `userId` is derived from `data._id.toString()` — the service is expected to return a MongoDB ObjectId under `_id`.
