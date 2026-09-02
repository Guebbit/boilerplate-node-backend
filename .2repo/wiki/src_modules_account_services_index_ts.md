# src/modules/account/services/index.ts

## Purpose

Barrel module that re-exports every function from the account sub-services (authentication, profile, addresses, verification, tokens, token-cleanup, export, two-factor) into a single `accountService` namespace plus a short list of named re-exports. It exists so callers have one import site and the namespace acts as a catch-all registry; no business logic lives here.

## Key elements

- **`accountService`** — the primary export; an object literal bundling all 35 service functions (auth, profile, address CRUD, verification, token lifecycle, cleanup, export, 2FA). Controllers and tests reach through this namespace.
- **Named re-exports** — `tokenAdd`, `signup`, `login`, `PASSWORD_RESET_TOKEN_TYPE`, `passwordChange`, `passwordChangeWithCurrent`, `updateProfile`, `addressForCheckout`, `sendVerificationEmail`, `EMAIL_VERIFY_TOKEN_TYPE`, `runTokenCleanup`. A deliberately smaller subset: only functions that are actually imported by name elsewhere.
- **Imports from sub-modules** — `./authentication`, `./profile`, `./addresses`, `./verification`, `./tokens`, `./token-cleanup`, `./export`, `./two-factor`.

## Relationships

- **Consumed by controllers** (all 15 listed neighbors): `post-login.ts`, `post-login-2fa.ts`, `post-2fa-setup.ts`, `post-2fa-confirm.ts`, `delete-2fa.ts`, `delete-account-request.ts`, `delete-account-confirm.ts`, `delete-address.ts`, `delete-expired-tokens.ts`, `delete-session.ts`, `get-account.ts`, `get-addresses.ts`, `get-refresh-token.ts`, `get-sessions.ts`, `post-account-export.ts`. Each imports specific functions from this file (via `accountService.*` or the named exports) and delegates the operation.
- **Depends on sub-service files** under `src/modules/account/services/` (the eight `./` imports above). This file adds no logic; it is a pass-through.
- **`../session/`** sits below this layer (JWT signing, refresh cookie, shared expiry) per the module doc comment; nothing outside the account module imports `session/` directly.

## Notes

- **Dual export pattern is intentional and maintained manually.** The named-export list is a *subset* of `accountService`; it was trimmed to only what is imported by name (address-book CRUD and `tokenRemoveAll` were removed because no caller uses them that way). Adding a new function to `accountService` does **not** automatically add it to the named exports — update both lists together.
- The namespace is explicitly described as carrying *every* exported function, including side-effecting jobs (`sendVerificationEmail`, `runTokenCleanup`), to prevent silent loss of members.
- The split rationale (why this folder instead of one file) is documented in `docs/theory/layers.md`; the module boundary is described in `src/modules/account/index.ts`.
