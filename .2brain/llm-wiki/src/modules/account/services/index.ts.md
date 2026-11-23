---
source: src/modules/account/services/index.ts
source_sha256: ca47a657f16f334bb1d5b5eeafaac5f9feadc512b37050b45bbf4e79f115e474
context_sha256: d5c491ba32ce9fff0964aa1dbcc38a6375eb2192dc956efbe2ab616af44bcc6c
generated_at: 2026-11-22T03:37:42.842166+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/services/index.ts

## Purpose
Barrel and single entry point for the account module's service layer. It groups the per-flow service files (one file per flow) into two objects, `accountService` and `twoFactorService`, and re-exports a few constants and error classes. The point is that callers use one door for operations while pure values stay as named exports.

## Key elements
- **`accountService`**: object of account operations. It covers signup, login, logout and session revoke, account deletion (schedule, restore, purge), password reset and change, profile, email change, email verification, one-time token rejection recording, sessions list/get, reauth, and OAuth link management. It also has maintenance reapers (previous emails, expired exports, inactive accounts), TOTP secret re-encryption, `sendAccountMail`, and the public config helpers `sessionConfig` and `oauthProviders`.
- **`twoFactorService`**: object for 2FA. It has `twoFactorStatus`, `setupTwoFactorMethod`, `sendMethodCode`, `confirmTwoFactorMethod`, `removeTwoFactorMethod`, `disableTwoFactor`, `regenerateBackupCodes`, and the login-time pair `sendLoginCode` and `verifyLoginChallenge`.
- **Re-exported constants**:
  - Token types from `../token-types`: `PASSWORD_RESET_TOKEN_TYPE`, `ACCOUNT_RESTORE_TOKEN_TYPE`, `EMAIL_VERIFY_TOKEN_TYPE`, `EMAIL_CHANGE_TOKEN_TYPE`, `EMAIL_CHANGE_UNDO_TOKEN_TYPE`.
  - `termsVersion` from `../consent-record`.
  - `operatorIdentity`.
  - `RESET_REQUEST_SECONDS`.
  - `amrAfterReauth`.
  - `VERIFY_RESEND_SECONDS`.
- **Re-exported OAuth errors**: `OAuthEmailUnverifiedError`, `OAuthAccountUnverifiedError`, `OAuthAccountUnavailableError`, `OAuthAccountExistsError`, `OAuthIdentityTakenError`, `OAuthLinkExpiredError`.

## Relationships
- Imports each flow file as a namespace (`./signup`, `./login`, `./logout`, `./refresh`, `./oauth`, `./two-factor-enrollment`, `./two-factor-challenge`, and so on) and exposes selected functions from them.
- `../consent-record` and `../token-types` supply re-exported values (`termsVersion` and the token-type constants).
- The account controllers (delete-account, get-session, get-sessions, get-oauth-links, get-oauth-callback, get-2fa, post-2fa-backup-codes, and others) are consumers. They call operations through these two objects. `src/app/config-routes.ts` is also a graph neighbor.
- It sits above `../session/` (JWT signing, refresh cookie, expiry). Code outside the module does not import `../session/` directly; it goes through `../index`.

## Notes
- The accounts and 2FA objects are kept separate because neither group calls the other. This keeps a caller of `accountService.login` from being coupled to 2FA types.
- Constants, error classes and pure helpers are named exports. Operations are reached only through the two objects.
- `./export` and `./export-job` are deliberately not part of these objects. Only the export controllers and the account module's own `module.ts` import them directly, because they are this module's own wiring (queue, file store, mail budget).
- Export data does not reach into sibling modules. Each module declares its own `personalData` section, and the account module's `module.ts` passes in the resolved list.
- `./export-rows` is published through `accountService.reapExpiredExports`. It touches only this module's own store.
- The address book lives in `@modules/addresses`, a separate module.
