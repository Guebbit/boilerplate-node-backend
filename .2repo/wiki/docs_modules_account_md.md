# docs/modules/account.md

## Purpose

Documents the `account` module, which answers the kernel's "who is making this request?" question. It owns session lifecycle (signup, login, refresh, password reset, logout-everywhere, two-step deletion) and the per-account address book, and it is the repo's only `shared-kernel` consumer.

## Key elements

- **Auth resolver** — registered at import time into `kernel/authentication.ts`; every guard in the app resolves through it. No boot step involved.
- **Address book** — one document per account; the only collection this module owns outright. CRUD is internal (served by this module's own routes).
- **`addressForCheckout`** — the single barrel export; the one function the cart uses as its `customer-supplier` arrow.
- **`session/` internals** (JWT signing, cookie shape, lifetimes) — consumed only by this module via relative imports; deliberately not published.
- **`user.deleted` event** — cascading deletion: a destroyed account removes its address book; cart and wishlist listen to the same event.
- **User record** — does NOT belong here; it lives in [`users`](./users.md) and is reached through that module's barrel.

## Relationships

- **`users`** — account authenticates against the User record owned by `users`. This is the repo's only `shared-kernel` edge.
- **`account-sessions`** — deep-dive on the token mechanics (signing, rotation, lifetimes) that this module uses internally.
- **`cart-checkout`** — consumes `addressForCheckout`; the sole cross-module arrow out of this module's barrel.
- **`security` (tools)** — hashing, cookie flags, and response headers that surround the tokens this module issues.
- **`request-flow` (theory)** — shows where the guard installed by this module sits in the per-request pipeline.
- **`strategic-ddd` (theory)** — explains what the `shared-kernel` cost means for the account↔users boundary.

## Notes

- The barrel is intentionally one line wide. The `session/` files were once published "for authorization" but no sibling ever imported them; keep them internal.
- Changing token lifetimes or cookie flags silently breaks every guard in the app — there is no central "auth config" to audit.
- The resolver is registered at **import time**, not in a startup hook. Reordering imports can break it.
