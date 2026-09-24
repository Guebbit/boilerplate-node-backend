---
source: src/modules/account/services/index.ts
sha256: 0a072d68f5616ed625061b6e6f9ae6bf04dd82779ce70d9037061c01da3c13d9
generated_at: 2026-09-23T18:08:52.736710+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/services/index.ts

## Purpose

Barrel file for the account services layer. It assembles the sub-modules (`authentication`, `profile`, `verification`, `tokens`, `token-cleanup`, `oauth`, `two-factor`) into two namespace objects (`accountService`, `twoFactorService`) and re-exports a curated set of named symbols. It exists so callers can import by namespace or by individual name without reaching into internal files, and so the dependency surface stays explicit and flat.

## Key elements

- **`accountService`** — namespace object aggregating login/signup, profile CRUD, email verification/change, session-token management, token cleanup, and OAuth entry points (31 members).
- **`twoFactorService`** — namespace object for 2FA enrollment, method removal, backup-code regeneration, and the login-time challenge/verify pair (9 members).
- **Named re-exports** — individual symbols surfaced at top level for callers that prefer `import { login } from '…'` over `accountService.login`: `PASSWORD_RESET_TOKEN_TYPE`, `passwordChangeWithCurrent`, `updateProfile`, `sendVerificationEmail`, `EMAIL_VERIFY_TOKEN_TYPE`, `EMAIL_CHANGE_TOKEN_TYPE`, `VERIFY_RESEND_SECONDS`, `completeEmailChange`, `runTokenCleanup`, `loginOrCreateFromOAuth`, `recordOAuthFailure`, `OAuthEmailUnverifiedError`, `OAuthAccountUnverifiedError`.

## Relationships

- **Controllers (all 15 listed)** import from this file by namespace or by named export:
    - `accountService.*` — used by `delete-account-confirm`, `delete-account-request`, `delete-expired-tokens`, `delete-session`, `get-account`, `get-oauth-callback`, `get-refresh-token`, `get-sessions`, `post-email-change-confirm`.
    - `twoFactorService.*` — used by `delete-2fa-method`, `delete-2fa`, `get-2fa`, `post-2fa-backup-codes`, `post-2fa-confirm`, `post-2fa-setup`.
- **Sub-module files** (`./authentication`, `./profile`, `./verification`, `./tokens`, `./token-cleanup`, `./oauth`, `./two-factor`) are the sole import sources; this file adds no logic of its own.
- **`../index.ts`** (module barrel) re-exports this file wholesale to consumers outside the account module.
- **`./export`** is intentionally _not_ imported here (see Notes).

## Notes

- **`./export` is excluded on purpose.** It reaches into `cart`/`wishlist`/`orders` modules. Importing it here would pull every one of those barrels into this file's reachability and risk a circular dependency for any sibling that imports `@modules/account`. `post-account-export` imports `./export` directly instead.
- **Two namespaces, not one.** `accountService` and `twoFactorService` are separate because neither group calls the other; splitting them prevents a caller of `accountService.login` from being coupled to 2FA types.
- **Prefer direct imports** when a caller needs only one or two names; the namespaces exist for browsability, not as the only entry point.
- **Unused-by-name re-exports are allowed** (same convention as the module barrel per CLAUDE.md). If a caller needs a name not listed, the expectation is to add the export rather than copy the logic.
