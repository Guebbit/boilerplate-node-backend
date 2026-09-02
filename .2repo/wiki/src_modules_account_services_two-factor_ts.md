# src/modules/account/services/two-factor.ts

## Purpose

Service layer for the full two-factor authentication lifecycle: enrolling a new TOTP secret, confirming it with a code from the user's authenticator, disabling the feature, and verifying the code at login time. It deliberately stops short of session minting — that responsibility belongs to the post-login controller, keeping "verify a code" and "create a session" in separate units.

## Key elements

- **`verifyCodeOrBackup(user, code)`** — internal helper; tries TOTP first, then a one-use backup code. Mutates `user` in place (advances `twoFactorLastUsedStep` or splices the used backup code); the caller is responsible for `userRepository.save`.
- **`setupTwoFactor(userId)`** — `POST /account/2fa/setup`. Generates a fresh secret, stores it encrypted, clears all prior 2FA state (including a previously *confirmed* secret — this is the re-enrollment path). Returns the plaintext secret and its `otpauth://` URI.
- **`confirmTwoFactor(userId, code, context)`** — `POST /account/2fa/confirm`. Validates the pending secret against the supplied code, stamps `twoFactorEnabledAt`, mints backup codes (returned in the clear exactly once), and emits an audit event (`AUTH_2FA_ENROLLED`).
- **`disableTwoFactor(userId, code, context)`** — `DELETE /account/2fa`. Requires both a fresh-auth route guard *and* a valid code/backup code. Wipes all 2FA fields. Emits `AUTH_2FA_DISABLED` audit.
- **`verifyLoginChallenge(challenge, code, context)`** — `POST /account/login/2fa`. Verifies the JWT challenge token from the first login step, then checks the code against the named account. Returns the saved `UserDocument` on success; does **not** issue a session. Audits failures only (`AUTH_2FA_CHALLENGE_FAILED`); the success audit (`AUTH_LOGIN`) is fired by the post-login controller once a session actually exists.

## Relationships

- **`@modules/users`** (`repository.ts`, `model.ts`) — All account lookups go through `userRepository.findByIdWithCredentials`; the `UserDocument` type carries the `twoFactorSecret`, `twoFactorEnabledAt`, `twoFactorLastUsedStep`, and `twoFactorBackupCodes` fields that this service mutates.
- **`../two-factor.ts`** — Crypto/encoding primitives: `generateTotpSecret`, `buildOtpauthUri`, `encryptTotpSecret`, `decryptTotpSecret`, `verifyTotpCode`, `generateBackupCodes`, `hashBackupCode`. This file orchestrates them; the neighbor holds the pure algorithms.
- **`../session/jwt.ts`** — `verifyMfaChallenge` validates the challenge token (signature, expiry, `purpose`) before `verifyLoginChallenge` proceeds to code verification.
- **`../audit.ts`** — Provides `accountAuditActions` constants (`AUTH_2FA_ENROLLED`, `AUTH_2FA_DISABLED`, `AUTH_2FA_CHALLENGE_FAILED`) used in every audit emission.
- **`@infrastructure/observability/audit.ts`** — `buildAuditEvent` / `emitAuditEvent` pair consumed by `confirmTwoFactor`, `disableTwoFactor`, and `verifyLoginChallenge`.
- **`@infrastructure/http/response.ts`** — `generateSuccess` / `generateReject` and the `ResponseSuccess` / `ResponseReject` types shape every return value.
- **`@infrastructure/http/errors.ts`** — `rejectDatabaseEnvelope('auth', error)` is the uniform `.catch` handler for Mongoose / cast errors.
- **`@infrastructure/http/request.ts`** — `CallerContext` type carried through to audit-building calls.
- **`@infrastructure/i18n`** — `t()` for user-facing error messages (`account.two-factor.*` keys).
- **`./index.ts`** (services barrel) — re-exports the four public functions for controller imports.

## Notes

- **Mutate-then-save contract.** `verifyCodeOrBackup` and the inline code in `setupTwoFactor` / `confirmTwoFactor` / `disableTwoFactor` all mutate the `UserDocument` in place. Forgetting a `userRepository.save` after calling the helper silently discards the state change (e.g., a consumed backup code would appear to still work on the next attempt).
- **Setup is destructive by design.** Calling `setupTwoFactor` on an account that already has a *confirmed* secret wipes it. This is the intended "lost my phone" re-enrollment path but means there is no non-destructive "generate a QR" endpoint.
- **Two-argument `.then` in `verifyLoginChallenge`.** The rejection branch is passed as the second argument to `.then` (not a trailing `.catch`) so that a rejected challenge token (expired / wrong signature / wrong purpose) is handled distinctly from a downstream database error. A shared `.catch` would misreport a save failure as an invalid challenge.
- **Asymmetric audit on login.** `verifyLoginChallenge` emits an audit event only on failure. The success path is audited by `post-login-2fa.ts` as `AUTH_LOGIN`, because a verified code without a minted session is not yet a completed login.
- **Backup codes are single-use.** On a match the code is spliced out of the array and persisted. Unlike TOTP (replayed via `twoFactorLastUsedStep`), a backup code has no replay window — once removed it is gone.
