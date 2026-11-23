---
source: src/modules/account/services/reauth.ts
generated_at: 2026-11-22T03:41:05.230825+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/services/reauth.ts

## Purpose
Implements step-up re-authentication: proving "it is still me" for an already-signed-in account. A password account proves its password; an OAuth-only account (no password) proves control of its verified mailbox via a mailed code. The file only decides whether the proof holds. Re-minting the session stays the controller's job (`src/modules/account/session/session.ts`).

## Key elements
- `amrAfterReauth(method, otpProven)` — builds the new session's `amr` list from only what this re-authentication proved (`AMR.password` or `AMR.email`, plus `AMR.otp` if a second factor was verified). Login proofs are not carried over.
- `ReauthProven` — result type: `{ amr: string[] }`.
- `reauthMethods(userId)` — backs `GET /account/reauth`; returns the methods available to the account.
- `sendReauthCode(userId, method, context)` — backs `POST /account/reauth/methods/{method}/send`; mails a step-up code. Rejects with 422 for `password` or any method the account can't use, and answers `tooSoon` while the delivery cooldown is active. Audits `AUTH_REAUTH_CODE_SENT`.
- `reauth(userId, proof, context)` — verification half of `POST /account/reauth`; proves the method, then the optional second factor, and audits `AUTH_REAUTHENTICATED`.
- Internal helpers:
  - `methodsOf` — `['password']` if the user has a password; otherwise `['email']` if the address is verified and the email second-factor method is available; otherwise `[]`.
  - `deliverCode` — resets `user.reauthCode`, queues the mail via `deliverEmailCode`, then persists the digest with `accountUserService.armReauthCode`.
  - `passwordMatches` / `codeMatches` — verify a password (`verifyPassword`) or a mailed code (`verifyDeliveredCode` with `kind: 'reauth'`).
  - `proveMethod` — refuses a method the account lacks before comparing anything, then checks the proof.
  - `proveOtp` — runs the second-factor check via `proveSecondFactor` only after the primary method passed.
  - `rejectAuthFailure` — maps storage errors to the shared database envelope (`rejectDatabaseEnvelope('auth', …)`).

## Relationships
- `src/modules/account/services/caller.ts` — `withOwnAccount` loads the caller's account for every public function.
- `src/infrastructure/http/response.ts` — `generateSuccess` / `generateReject` and the response types.
- `src/infrastructure/http/errors.ts` — `rejectDatabaseEnvelope` for storage failures.
- `src/infrastructure/i18n/index.ts` (with `src/infrastructure/i18n/context.ts`) — `t()` supplies the localized rejection messages for the `account.reauth.*` keys.
- `src/infrastructure/security/password-hash.ts` — `verifyPassword` for the password check.
- `src/infrastructure/observability/audit.ts` and `src/modules/account/audit.ts` — `recordAudit` plus the `accountAuditActions` constants.
- `src/modules/account/emails.ts` — `reauthCodeEmail` template for the mailed code.
- `src/modules/account/two-factor/delivered-code-verify.ts` — `verifyDeliveredCode` for checking the mailed code (the other two-factor helpers, `deliverEmailCode`, `deliveryCooldownRemaining` and `twoFactorMethod`, come from the two-factor module).
- `src/modules/account/services/two-factor-outcomes.ts` (`tooSoon`) and `src/modules/account/services/two-factor-lockout.ts` (`proveSecondFactor`) — the cooldown response and the second-factor check.
- `src/modules/account/domain/session-proof.ts` — the `AMR` constants.
- `src/modules/account/services/index.ts` — the services barrel for this folder.
- `src/modules/account/tests/unit/reauth-policy.test.ts` — unit tests for this policy.

## Notes
- The mail is queued before the write, so a refusing queue leaves no code armed.
- A password account is refused a mailed code, so the send route can't mail unwanted codes to an account with a better proof.
- A missing `otp` in the body is not a failure. The session just earns no `otp` amr, and a route that demands one asks again.
- A password-only re-auth deliberately does not keep an earlier `otp` amr, even though `auth_time` is refreshed.
- Unlike `login`, there is no dummy-compare to hide account existence, because the access token already identifies the caller.
- The active/deletedAt gate is not re-checked here, since `isAuth` already ran it.
- The `email` amr value is this app's own, not an RFC 8176 registered value.
