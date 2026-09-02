# src/modules/account/controllers/post-login.ts

## Purpose

Controller for `POST /account/login`. Receives credentials, validates the optional `remember` tier, runs a pre-login token cleanup, delegates the credential check to the account service, and on success mints a session (refresh cookie + short-lived access token) or returns a 2FA challenge. Success/failure metrics, audit, and analytics are emitted here in the controller rather than in the service.

## Key elements

- **`postLogin(request, response)`** — the sole export. Orchestrates the full login flow:
  - Destructures `email` / `password` directly from `request.body` without Zod parsing (deliberate: prevents a 422 on short passwords from leaking info or bypassing `recordLoginFailure`).
  - Parses only `remember` via `rememberSchema` (a `z.enum(RefreshTokenExpiryTime)` guard) before proceeding.
  - Calls `runTokenCleanup()` → `accountService.login(email, password)` in sequence.
  - On failure: calls `recordLoginFailure` then `rejectResponse`.
  - On success with `twoFactorEnabledAt`: returns a 200 with `{ mfaRequired: true, challenge }` (no cookies, no access token).
  - On plain success: calls `issueSession(response, userId, remember)` to set cookies and obtain an access token, then `recordLoginSuccess`.
  - All unexpected errors are routed through `rejectDatabaseError`.

- **`rememberSchema`** — module-local Zod schema; the only field in the request body that is formally validated.

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/modules/account/routes.ts` | Registers `postLogin` on the `POST /account/login` route. |
| `src/modules/account/services/index.ts` | Provides `accountService.login` (credential check) and `runTokenCleanup` (stale-token sweep). |
| `src/modules/account/services/token-cleanup.ts` | Implements the cleanup that `runTokenCleanup` invokes before each login attempt. |
| `src/modules/account/session/session.ts` | `issueSession` sets refresh/access cookies and returns the access token. |
| `src/modules/account/session/jwt.ts` | `createMfaChallenge` mints the short-lived 2FA challenge token. |
| `src/modules/account/session/config.ts` | Supplies the `RefreshTokenExpiryTime` enum used by `rememberSchema`. |
| `src/modules/account/session/login-observability.ts` | `recordLoginSuccess` / `recordLoginFailure` emit metrics, audit, and analytics events. |
| `src/infrastructure/http/controller.ts` | Provides `rejectValidation` for the `remember` schema failure path. |
| `src/infrastructure/http/errors.ts` | Provides `rejectDatabaseError` for the catch-all error path. |
| `src/infrastructure/http/response.ts` | Provides `successResponse` and `rejectResponse` helpers. |
| `src/types/index.ts` | Supplies the `LoginRequest` type for the Express request body generic. |
| `src/modules/account/tests/unit/token-cleanup.test.ts` | Unit-tests the cleanup step this controller depends on. |

## Notes

- **Validation order is a security decision, not an oversight.** `email` and `password` are intentionally *not* Zod-parsed. A 422 on a too-short password would (a) leak information about the account and (b) skip `recordLoginFailure`, dropping the attempt from the audit trail. Only the stored-hash comparison in the service decides success vs. failure.
- **`remember` is the one field that *is* parsed**, and it is parsed *first*, because an invalid tier must not propagate into a cookie with no expiry.
- **2FA short-circuits before `issueSession`.** No cookies or access token are set; the downstream `postLoginTwoFactor` endpoint completes the login.
- **Errors after the credential check (token cleanup, cookie issuance) are *not* recorded as login failures** — the user may have had the correct password — so they route through `rejectDatabaseError` rather than `recordLoginFailure`.
