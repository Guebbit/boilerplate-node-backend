---
source: src/modules/account/services/index.ts
sha256: afc99299b97abd5e146b6f2cab5996304c49b03104e5244d4120a341f438aad8
generated_at: 2026-10-15T10:00:27.717966+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/services/index.ts

## Purpose

Barrel/index file for the account services layer. It re-exports the module's individual service functions (for targeted imports) and groups them into two published namespaces — `accountService` (auth, profile, tokens, OAuth, email, deletion) and `twoFactorService` (enrollment, challenge, backup codes) — so controllers can import either a whole flow group or a single named function.

## Key elements

- **`accountService`** — namespace object bundling ~40 functions: signup/login/logout, password & email verification, profile CRUD, one-time token issue/spend, session list/revoke, refresh-token rotation, reauth, OAuth link management, account deletion, and periodic sweeps (`reapLapsedPreviousEmails`, `reapExpiredExports`).
- **`twoFactorService`** — namespace object for 2FA: `buildLoginChallenge`, `sendLoginCode`, `verifyLoginChallenge`, method setup/confirm/remove, `disableTwoFactor`, `regenerateBackupCodes`.
- **Named re-exports** — token-type constants (`PASSWORD_RESET_TOKEN_TYPE`, etc.), `RESET_REQUEST_SECONDS`, `amrAfterReauth`, `passwordChangeWithCurrent`, `updateProfile`, verification helpers, `reapInactiveAccounts`, `reencryptTotpSecrets`, `sendAccountMail`, and OAuth error classes (`OAuthEmailUnverifiedError`, `OAuthAccountUnverifiedError`, `OAuthAccountUnavailableError`). Intended for callers that need one symbol without pulling the namespace.
- **Not exported here (by design):** `./export` and `./export-job` — the module's own data-export wiring. They are imported directly by the export controllers and `../module.ts`, not through this barrel.

## Relationships

Every listed controller is a downstream caller of this barrel:

| Controller | Likely call(s) |
|---|---|
| `cancel-pending-email.ts` | `accountService.cancelPendingEmailChange` |
| `delete-2fa-method.ts` | `twoFactorService.removeTwoFactorMethod` |
| `delete-2fa.ts` | `twoFactorService.disableTwoFactor` |
| `delete-account-confirm.ts` | `accountService.confirmAccountDeletion` |
| `delete-account-request.ts` | `accountService.requestAccountDeletion` |
| `delete-oauth-link.ts` | `accountService.unlinkOAuthProvider` |
| `delete-session.ts` | `accountService.sessionRevoke` / `logoutCurrentSession` |
| `get-2fa.ts` | `twoFactorService.twoFactorStatus` |
| `get-account.ts` | `accountService.getOwnProfile` |
| `get-oauth-callback.ts` | `accountService.loginOrCreateFromOAuth` |
| `get-oauth-links.ts` | `accountService.listOAuthLinks` |
| `get-reauth-methods.ts` | `accountService.reauthMethods` |
| `get-refresh-token.ts` | `accountService.refreshAccessToken` |
| `get-sessions.ts` | `accountService.sessionsList` |
| `post-2fa-backup-codes.ts` | `twoFactorService.regenerateBackupCodes` |

No listed neighbor is an *upstream* dependency of this file; the arrow is strictly controller → this barrel → individual `./` service files.

## Notes

- **Two namespaces, not one:** `accountService` and `twoFactorService` are split so a login caller is not TypeScript-coupled to 2FA symbols. They never call each other.
- **Prefer direct import:** if a caller needs one or two functions, import them by name (the named re-exports exist for this). The namespaces exist so the surface can be browsed.
- **Unused-by-name exports are intentional** — this is a module barrel; a caller that can't find a name should add the export here rather than copy logic.
- **`../session/`** (JWT signing, refresh cookie, shared expiry) sits *below* this layer and is not re-exported; nothing outside the account module imports it directly (see `../index`).
- **`./export-rows`** (the reaper) *is* published here because it only touches this module's own store; `./export` and `./export-job` are deliberately withheld.
