---
source: src/modules/account/services/index.ts
sha256: 4853ab11b602e0caec941f55031164caa0174c387bc6f66f25aa77e5f6989909
generated_at: 2026-10-14T08:48:45.807830+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/services/index.ts

## Purpose

Barrel/index file for the account services layer. It re-exports functions from ~20 sibling files (one file per flow) and groups them into two browsable namespaces — `accountService` and `twoFactorService` — so callers can import by name or by group. It also directly re-exports a curated set of individual functions and constants for callers that need only one or two symbols.

## Key elements

- **`accountService`** — namespace object bundling core account flows: signup, login/logout, token issue/find/spend/redeem, password change & reset, profile update, email verification & change, session listing/revoke, reauth, previous-email cleanup, expired-export reaping, and OAuth (login, link list, unlink, failure recording).
- **`twoFactorService`** — namespace object for 2FA: login challenge build/send/verify, method enrollment (status, setup, confirm, remove, disable), and backup-code regeneration.
- **Named re-exports** — individually exported symbols for direct-import callers: token-type constants (`PASSWORD_RESET_TOKEN_TYPE`, `ACCOUNT_DELETE_TOKEN_TYPE`, `EMAIL_VERIFY_TOKEN_TYPE`, `EMAIL_CHANGE_TOKEN_TYPE`, `EMAIL_CHANGE_UNDO_TOKEN_TYPE`), timing constants (`RESET_REQUEST_SECONDS`, `VERIFY_RESEND_SECONDS`), and single functions (`amrAfterReauth`, `passwordChangeWithCurrent`, `updateProfile`, `sendVerificationEmail`, `completeEmailChange`, `undoEmailChange`, `reapLapsedPreviousEmails`, `reapExpiredExports`, `reencryptTotpSecrets`, `sendAccountMail`, `loginOrCreateFromOAuth`, `recordOAuthFailure`, and the OAuth error classes).

## Relationships

- **Consumed by** the account controllers listed in the graph (e.g. `cancel-pending-email`, `delete-2fa-method`, `delete-account-confirm`, `get-account`, `get-sessions`, `post-2fa-backup-codes`, etc.), which import either a namespace member or a directly exported name.
- **Re-exports from** its own sub-files: `./signup`, `./login`, `./logout`, `./refresh`, `./password-reset-request`, `./deletion-request`, `./password`, `./password-reset`, `./email-change`, `./self-delete`, `./profile`, `./verification`, `./tokens`, `./previous-email-cleanup`, `./sessions`, `./export-rows`, `./oauth`, `./two-factor-enrollment`, `./two-factor-challenge`, `./reauth`, `./reencrypt`, `./mail`, and `../token-types`.
- **Does NOT import** `./export` or `./export-job`; those are wired directly by the export controllers and `../module.ts`.

## Notes

- The split into two namespaces (`accountService` / `twoFactorService`) is deliberate: neither group calls the other, so keeping them separate prevents a caller of e.g. `accountService.login` from being coupled (in TypeScript) to 2FA types.
- Prefer importing a single function directly (e.g. `import { updateProfile } from '…/services'`) over the namespace when a caller needs only one or two symbols; the namespaces exist for browsing.
- Named exports that go unused by a given caller are intentional — the barrel is a "copy the logic if the name you want isn't listed" guardrail (see `CLAUDE.md` "Module barrels" convention).
- `export-rows` (the reaper) is published here because it only touches this module's own store; `export` and `export-job` are excluded because they carry module-internal wiring (queue, file store, mail budget) no sibling needs.
