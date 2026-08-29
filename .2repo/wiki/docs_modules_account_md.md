# docs/modules/account.md

## Purpose

Documents the `account` module, which owns session lifecycle (signup, login, refresh, password reset, logout-everywhere, two-step deletion) and the per-account address book. It registers the application's single auth resolver at import time, answering the kernel's "who is making this request?" question for every guard.

## Key elements

- **Auth resolver** — installed at module import (not a boot step); every request guard resolves through it.
- **Address book** — the module's sole owned collection; one document per account, destroyed on the shared `user.deleted` event.
- **`addressForCheckout`** — the only barrel export; returns the single shipping address for an order. Serves as the cart's `customer-supplier` arrow.
- **`session/` internals** — JWT signing, cookie shape, and token lifetimes. Deliberately private to this module; no sibling imports them.
- **Own routes** — address CRUD and all auth flows are served by this module's routes, not a shared controller layer.

## Relationships

- **`docs/modules/account-sessions.md`** — detail reference for the token mechanics (lives, cookie flags, refresh flow) that this module's internals implement. This page treats them as an opaque unit; the sessions page unpacks each.
- **`docs/api/endpoints.md`** — the auth and address CRUD routes owned by this module appear in the endpoint catalog. Changes to route shapes or auth middleware flow through both pages.

## Notes

- The barrel is intentionally one line wide (`addressForCheckout`). The `session/` files are reached only by relative import inside the module—no external consumer should touch them.
- Token lifetimes and cookie flags are the module's blast radius: every guard in the app resolves through them, so a change here is an app-wide breaking change.
- This module is the repo's only `shared-kernel` edge, via its dependency on `users` for the User record. It does not own the user; it authenticates through it.
- Address book deletion is event-driven (`user.deleted`), not a direct cascade—same mechanism cart and wishlist use.
