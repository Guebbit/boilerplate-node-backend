---
source: src/modules/account/services/index.ts
sha256: b8ef20b83ef100bc3233ef365ab41dc3b8c9e6d4dc147ad3389c61d0341a0700
generated_at: 2026-10-29T02:41:10.850044+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/services/index.ts

## Purpose

Barrel facade for the account service layer. It aggregates every per-flow service module (signup, login, OAuth, 2FA, email verification, sessions, etc.) into two namespace objects — `accountService` and `twoFactorService` — so callers import one file and never reach into individual flow files. It also re-exports the constants, error classes, and pure helpers that controllers need alongside those functions.

## Key elements

- **`accountService`** (object) — Core account operations: signup, login, logout, refresh, password change/reset, profile read/update, email verification & change, account deletion scheduling/restoration/purge, session list/get/revoke, previous-email cleanup, OAuth link management, reauth, inactive-account reaping, TOTP re-encryption, and account mail sending.
- **`twoFactorService`** (object) — 2FA enrollment (setup, confirm, remove, disable), backup-code regeneration, and the login-time challenge pair (`buildLoginChallenge`, `sendLoginCode`, `verifyLoginChallenge`).
- **Named re-exports** — `PASSWORD_RESET_TOKEN_TYPE`, `ACCOUNT_RESTORE_TOKEN_TYPE`, `EMAIL_VERIFY_TOKEN_TYPE`, `EMAIL_CHANGE_TOKEN_TYPE`, `EMAIL_CHANGE_UNDO_TOKEN_TYPE` (from `../token-types`); `termsVersion` (from `../consent-record`); `RESET_REQUEST_SECONDS`; `amrAfterReauth`; `VERIFY_RESEND_SECONDS`; six `OAuth*Error` classes.

## Relationships

- **`src/modules/account/consent-record.ts`** — Re-exports `termsVersion` so controllers can read the agreed terms version without importing the consent module directly.
- **Controllers (all listed neighbors)** — Each controller imports the specific method it needs from `accountService` or `twoFactorService` (e.g. `delete-account.ts` → `accountService.scheduleAccountDeletion` / `restoreAccountByLink`; `post-2fa-confirm.ts` → `twoFactorService.confirmTwoFactorMethod`; `get-oauth-callback.ts` → `accountService.loginOrCreateFromOAuth`; `get-refresh-token.ts` → `accountService.refreshAccessToken`). This file is the single import point; no controller imports a sub-flow file directly.

## Notes

- **Two objects, not one.** `accountService` and `twoFactorService` are deliberately split because neither group calls the other. A caller of `accountService.login` is not TypeScript-coupled to 2FA types.
- **Export flow excluded on purpose.** `./export` and `./export-job` are *not* part of either object; only the export controllers and `../module.ts` import them directly.
- **Address book is a different module** (`@modules/addresses`). No sibling's data is accessed through this file.
- **`../session/`** (JWT signing, refresh cookie, shared expiry) sits *below* this layer. Nothing outside the account module imports it directly; go through `../index`.
- The `exportRows` import in this file is solely for `reapExpiredExports` (the "reaper"), which reaches only the module's own store.
