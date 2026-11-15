---
source: src/modules/account/services/index.ts
sha256: 2bb4f072aa01a023a732ccb3b1941ea70336b3c4a75ebe98709e55a5eee4d872
generated_at: 2026-11-14T18:44:57.973864+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/services/index.ts

## Purpose

Barrel file that assembles the account service layer into two flat objects (`accountService`, `twoFactorService`) and re-exports shared constants, error classes, and small named helpers. It is the single public surface that controllers and the module's public index use to reach every authentication, profile, token, OAuth, and 2FA operation, while hiding the per-flow sub-modules it imports.

## Key elements

- **`accountService`** — Flat object (~45 methods) covering signup, login, logout, session management, token refresh, password reset/change, email verification & change, profile read/update, OAuth linking, account deletion & restore, previous-email cleanup, export-row reaping, inactive-account reaping, TOTP re-encryption, account mail, and public config. Each method is a direct alias to a function in a sibling sub-module (`./signup`, `./login`, `./oauth`, `./sessions`, etc.).
- **`twoFactorService`** — Flat object (9 methods) for 2FA status, enrollment (setup/confirm/remove/disable), backup-code regeneration, and the login-time challenge/verify pair. Kept separate so a caller of `accountService.login` is not coupled at the TypeScript level to any 2FA type.
- **Named re-exports** — Token-type constants (`PASSWORD_RESET_TOKEN_TYPE`, `EMAIL_VERIFY_TOKEN_TYPE`, etc.), `termsVersion` (from `../consent-record`), `operatorIdentity`, `RESET_REQUEST_SECONDS`, `VERIFY_RESEND_SECONDS`, `amrAfterReauth`, and six OAuth error classes (`OAuthEmailUnverifiedError`, `OAuthIdentityTakenError`, …).

## Relationships

- **`src/modules/account/consent-record.ts`** — This file re-exports `termsVersion` from it; no other interaction.
- **Controllers (`get-account`, `get-session`, `get-sessions`, `get-refresh-token`, `get-2fa`, `get-reauth-methods`, `get-oauth-links`, `get-oauth-callback`, `delete-account`, `delete-email-change`, `delete-oauth-link`, `delete-session`, `post-2fa-backup-codes`)** — Each imports `accountService` or `twoFactorService` (or a re-exported error class) from this file to call a single service method; they never import the sub-modules directly.
- **`src/app/config-routes.ts`** — Consumes this module's public surface (via `../index`) when wiring the account routes; no direct import of the sub-modules.

## Notes

- **Two objects, not one.** Neither `accountService` nor `twoFactorService` calls the other. Splitting them means a caller that only needs `accountService.login` has no compile-time dependency on any 2FA type.
- **Deliberate exclusions.** `./export` and `./export-job` are *not* on `accountService`; they are wired only by the export controllers and `../module.ts`. The address book lives in the separate `@modules/addresses` module.
- **No sibling data access.** Each module declares its own `personalData` section; `../module.ts` resolves and passes the list in. This file never reaches into a sibling's data store.
- **Sub-layer.** `../session/` (JWT signing, refresh cookie, shared expiry) sits below this layer and is not imported by anything outside the account module.
- **Convention.** Every operation is reachable via one of the two objects; constants, error classes, and pure helpers remain named exports. There are no "loose" exported functions that duplicate an object method.
