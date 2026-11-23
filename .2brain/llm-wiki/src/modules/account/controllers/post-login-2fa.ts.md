---
source: src/modules/account/controllers/post-login-2fa.ts
source_sha256: d0d4c21369e32554cae520694586b293675d3a17870fe694d8de73aa6e47a79c
context_sha256: bf8b980f43a471c8bcccfcd3139daa06b153d8e2ea0001c1858d3ff0c9766334
generated_at: 2026-11-22T03:25:07.741990+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/controllers/post-login-2fa.ts

## Purpose
Express controller for `POST /account/login/2fa`, the second step of a two-factor login. It verifies the challenge issued by `POST /account/login` together with the caller's code. On success it mints a session the same way `postLogin` does for accounts without a second factor, or returns a deletion-pending claim check if the account is in its deletion grace period.

## Key elements
- `postLoginTwoFactor(request, response)` is the only export. Its flow:
  1. Parse the body with `LoginTwoFactorBody` via `parseBody`.
  2. Resolve the challenge from `parsed.challenge`, falling back to `readMfaChallengeCookie(request)`. If neither exists, respond 401 with `account.two-factor.challenge-invalid`.
  3. Capture `provedAt = Date.now()` before the code check. The comment says a password changed during verification must refuse the login.
  4. Call `twoFactorService.verifyLoginChallenge(challenge, code, callerContextOf(request))`. Which factor (armed factor or backup code) was used is left to the service.
  5. If `isRestorable(user)`, respond 200 with `buildDeletionPending(...)` and issue no session.
  6. Otherwise:
     - call `issueSession` with `remember`, `amr`, `provedAt` and `transport`;
     - call `recordLoginSuccess`;
     - build the body with `withAccountView`;
     - call `rememberDevice` with the user's email;
     - respond 200 with `LoginTwoFactorOutcome`.
- `amr` is extended with `AMR.otp` through `withProofs`. The session therefore carries `['pwd', 'otp']`, which later guards that demand a second factor read unchanged.
- Every failure path increments `authTwoFactorChallengeTotal{status:'failure'}` and every success path increments `{status:'success'}`.

## Relationships
- **`services` (`twoFactorService`)** verifies the challenge and code.
- **`services/deletion-sign-in`** supplies `buildDeletionPending` for the grace-period branch.
- **`oauth/mfa-redirect`** supplies `readMfaChallengeCookie` and `destroyMfaChallengeCookie`. OAuth-originated challenges never reach the client body, so they arrive via cookie.
- **`domain/session-proof`** supplies `AMR` and `withProofs`.
- **`session/account-view`** supplies `withAccountView`, which builds the success body.
- **`session/session`, `session/device-cookie` and `session/login-observability`** supply `issueSession`, `rememberDevice` and `recordLoginSuccess`.
- **`metrics`** supplies the `authTwoFactorChallengeTotal` counter.
- **`infrastructure/http/*`:**
  - `controller` supplies `parseBody` and `refused`.
  - `response` supplies `successResponse` and `rejectResponse`.
  - `errors` supplies `rejectDatabaseError`.
  - `request` supplies `callerContextOf`.
- **`infrastructure/i18n`** supplies `t` for the error message.
- **`routes.ts`** is a graph neighbor but is not imported here. It is presumably where the handler is mounted, though this file doesn't show that.
- `scripts/docs/generate-role-matrix.ts` and `src/infrastructure/adapters/logger.ts` appear as graph neighbors, but this file shows no direct interaction with them.

## Notes
- The challenge cookie is destroyed only on success, in both the session and deletion-pending branches. The comment says the challenge is spent either way, but the code does not destroy the cookie on failure.
- `rememberDevice` runs only in the full-session branch, not in the deletion-pending branch. The comment says the browser becomes familiar only once the login is complete.
- Any rejection in the promise chain goes to `rejectDatabaseError(response, 'postLoginTwoFactor', error)`, and the failure counter is incremented.
