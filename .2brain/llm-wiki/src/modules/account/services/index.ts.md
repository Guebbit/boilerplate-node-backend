---
source: src/modules/account/services/index.ts
sha256: 1a295b67b4b1fcdd1a3afd129f713de84381ca4d428c918138b6b2fe91734046
generated_at: 2026-09-27T14:29:28.908271+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/services/index.ts

## Purpose

Service-layer barrel for the account module. It re-exports functions from the sub-module files (`authentication`, `profile`, `verification`, `tokens`, `token-cleanup`, `oauth`, `two-factor`) into two named-namespace objects—`accountService` and `twoFactorService`—and also re-exports a curated set of individual functions for callers that need only one or two names. The split into two objects is deliberate: 2FA is kept separate so that a caller of, say, `accountService.login` has no TypeScript-level coupling to two-factor.

## Key elements

- **`accountService`** — Namespace object grouping login, signup, profile management, email verification, session-token CRUD, the token-cleanup job, and OAuth. ~30 properties, each a pass-through to a sub-module function.
- **`twoFactorService`** — Namespace object for 2FA enrollment, removal, backup codes, and the login-time challenge/verify pair (9 properties).
- **Named re-exports** — Select individual symbols (`PASSWORD_RESET_TOKEN_TYPE`, `sendVerificationEmail`, `loginOrCreateFromOAuth`, `sendAccountMail`, error classes, `runTokenCleanup`, etc.) so a caller can `import { login } from '../services'` without pulling the whole namespace.
- **Intentional omission of `./export`** — The data-export module is *not* mixed into either namespace or the re-export list to prevent a reachability cycle through the module barrel.

## Relationships

- **Downstream (this file → sub-modules):** Imports and re-exports from `./authentication`, `./profile`, `./verification`, `./tokens`, `./token-cleanup`, `./oauth`, `./two-factor`, and `./mail`.
- **Upstream (controllers → this file):** All account controllers (`cancel-pending-email`, `delete-2fa-method`, `delete-2fa`, `delete-account-confirm`, `delete-account-request`, `delete-expired-tokens`, `delete-session`, `get-2fa`, `get-account`, `get-oauth-callback`, `get-refresh-token`, `get-sessions`, `post-2fa-backup-codes`, `post-2fa-confirm`, `post-2fa-setup`) consume `accountService`, `twoFactorService`, or the individual named exports defined here.
- **Module barrel (`../index.ts`):** Publishes this file's exports wholesale to the rest of the codebase as `@modules/account`.
- **`../session/`:** Sits *below* this service layer (JWT signing, refresh cookie, shared expiry). Nothing outside the account module imports it directly.
- **`./export` (data-export):** Deliberately excluded from this file. `controllers/post-account-export` imports it directly instead, keeping `cart`/`wishlist`/`orders` out of this barrel's transitive reachability.

## Notes

- **Two namespaces, not one, is load-bearing.** Merging `twoFactorService` into `accountService` would make every `accountService` consumer transitively type-coupled to 2FA.
- **Prefer direct imports for 1–2 names.** The file's own comment says: if a caller needs one or two functions, import them from the sub-module file directly rather than reaching through the namespace. The namespaces exist for browseability.
- **Unused-by-name re-exports are allowed.** The "Published by name as well as on the namespace" block intentionally lists more symbols than every current consumer imports; the convention (per CLAUDE.md "Module barrels") is that a missing name should be *added* here, not re-implemented at the call site.
- **Do not add `./export` to this file.** Doing so would put `cart`, `wishlist`, `orders`, and their barrels into this module's static-import reachability, creating a cycle risk for any sibling that imports `@modules/account`.
