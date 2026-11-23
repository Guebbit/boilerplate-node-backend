---
source: src/modules/account/controllers/post-login.ts
source_sha256: ed06734e18df943a2c8bebea3ff0885c7fcfdc32d5f730e78cf1b7ff60309092
context_sha256: 43e356bd1cc52aec82aa7ac032ee024270b0975e606cf713f6cedff20251103f
generated_at: 2026-11-22T03:25:39.378232+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/controllers/post-login.ts

## Purpose
Express controller for `POST /account/login`. It validates the optional `remember`/`transport` fields, delegates the credential check to the account service, and then either completes the login (issuing a session) or returns an intermediate challenge for 2FA or pending account deletion. Metrics, audit and analytics for success and failure are emitted here rather than in the service.

## Key elements
- `rememberSchema`: zod schema for `remember` (`RememberTier` enum) and `transport` (`SESSION_TRANSPORTS` enum), both optional.
- `postLogin(request, response)`: the exported handler. `request.body` is typed `LoginRequest | undefined` because express 5 leaves it undefined when no parser matches.
  - Parses only `remember` and `transport` via `parseBody`, and returns early if that fails. The full body (`request.body ?? {}`) goes unparsed to `accountService.login`.
  - Takes `provedAt = Date.now()` before the hash check, so a password changed while it runs refuses this login.
  - On a refused result (`refused`), calls `recordLoginFailure` and returns.
  - **2FA branch** (`data.twoFactorEnabledAt`): responds 200 with `buildLoginChallenge(data, [AMR.password])`. No session or cookies, and no login recorded.
  - **Deletion-grace branch** (`isRestorable(data)`): responds 200 with `buildDeletionPending(data, [AMR.password])`. The client then restores via `POST /account/login/restore` or walks away.
  - **Normal branch**: `issueSession` → `recordLoginSuccess` → `withAccountView` → `rememberDevice` → `successResponse<LoginOutcome>(..., 200)`.
  - `.catch` passes any error to `rejectDatabaseError(response, 'postLogin', error)`.

## Relationships
- `src/modules/account/services/index.ts`: exports `accountService`, whose `login` does the credential check. It parses the body itself, so a malformed body gets a 422 from the service. It also compares against `DUMMY_PASSWORD_HASH` on a miss, so unknown accounts and wrong passwords both answer 401.
- `src/modules/account/services/two-factor-challenge.ts` (`buildLoginChallenge`) and `src/modules/account/services/deletion-sign-in.ts` (`buildDeletionPending`): build the non-session outcomes.
- `src/modules/account/session/session.ts` (`issueSession`): mints the refresh token, cookies and access token.
- `src/modules/account/session/strategy.ts`: provides `SESSION_TRANSPORTS`.
- `src/modules/account/session/account-view.ts` (`withAccountView`): builds the final response body.
- `src/modules/account/session/device-cookie.ts` (`rememberDevice`): marks the browser familiar for the account's email.
- `src/modules/account/session/login-observability.ts` (`recordLoginSuccess`, `recordLoginFailure`): metrics, audit and analytics.
- `src/modules/account/domain/session-proof.ts`: supplies the `AMR` constants used to tag the password proof.
- `src/modules/users/authenticatable.ts`: a graph neighbor, but not imported directly here; `isRestorable` is imported from `@modules/users`.
- `src/infrastructure/http/controller.ts` (`parseBody`, `refused`), `src/infrastructure/http/response.ts` (`successResponse`), `src/infrastructure/http/errors.ts` (`rejectDatabaseError`): shared HTTP helpers.
- `src/modules/account/routes.ts` presumably mounts this handler. That is not visible in this file.
- `src/infrastructure/adapters/logger.ts`: a graph neighbor, but not used in this file.

## Notes
- The body is deliberately not parsed against `LoginBody` here. A 422 raised in the controller would return before `recordLoginFailure` and drop the attempt from the audit trail. The service's 422 arrives after it and is recorded.
- `remember` is parsed first. It is not a secret, so a 422 leaks nothing about the credentials, and an unknown tier must not become a cookie with no lifetime.
- Errors in the `.catch` (credential check, token or cookie steps) are not recorded as login failures, because the password may have been correct.
- The 2FA and deletion branches record no login. `postLoginTwoFactor` finishes the 2FA flow.
