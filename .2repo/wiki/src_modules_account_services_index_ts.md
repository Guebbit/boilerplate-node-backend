# src/modules/account/services/index.ts

## Purpose

Barrel module for the account service layer. It re-exports every function from the six internal service files (`authentication`, `profile`, `addresses`, `verification`, `tokens`, `token-cleanup`) through two channels: a curated set of named exports for direct imports, and a single `accountService` namespace object that carries the full surface. It exists so controllers and external callers address one path (`../services`) rather than reaching into sub-files.

## Key elements

- **Named re-exports** — `tokenAdd`, `signup`, `login`, `PASSWORD_RESET_TOKEN_TYPE`, `passwordChange`, `passwordChangeWithCurrent`, `updateProfile`, `addressForCheckout`, `sendVerificationEmail`, `EMAIL_VERIFY_TOKEN_TYPE`, `runTokenCleanup`. A deliberate subset; address-book CRUD and `tokenRemoveAll` are excluded because no caller imports them by name.
- **`accountService` (object export)** — A single namespace containing all 31 functions from the six sub-modules, including side-effecting jobs (`sendVerificationEmail`, `runTokenCleanup`, `adminTokenCleanup`). Intended as the "reaches everything" access point.
- **Re-exported token-type constants** — `PASSWORD_RESET_TOKEN_TYPE` and `EMAIL_VERIFY_TOKEN_TYPE` are surfaced alongside the functions that create them.

## Relationships

- **Consumed by all 15 account controllers** (`get-account`, `post-login`, `post-logout`, `delete-account-request`, `delete-account-confirm`, `delete-address`, `get-addresses`, `get-refresh-token`, `get-sessions`, `post-logout-everywhere`, `post-password-change`, `post-reset-confirm`, `post-reset-request`, `delete-expired-tokens`) — each imports specific named exports or the `accountService` namespace from this file.
- **Aggregates six internal service files** (`./authentication`, `./profile`, `./addresses`, `./verification`, `./tokens`, `./token-cleanup`). Per the module doc, nothing outside the account module imports those files directly; this barrel is the sole public surface.

## Notes

- **Two export channels, different scoping.** Named exports are a curated list (adding a new export here is a conscious decision); `accountService` is exhaustive (adding a sub-module function *requires* adding it here or it silently disappears from the namespace). Keep them in sync when adding operations.
- **No logic lives here.** The file is pure re-export plus one object literal. Behaviour changes always belong in the sub-module files.
- **The "folder rather than one file" convention** (referenced to `docs/theory/layers.md`) explains why the account service was split at ~300 lines; the same rule that retired `addresses-service.ts` into this structure applies to future splits.
