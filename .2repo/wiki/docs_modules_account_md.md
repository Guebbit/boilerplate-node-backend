# docs/modules/account.md

## Purpose

Documents the `account` module, the application's sole authority for authentication (signup, login, token refresh, password reset, logout-everywhere, two-step deletion) and the per-account address book. It is the only `shared-kernel` edge in the repo: it fills the `kernel/authentication.ts` port at import time, so every guard in the app resolves through it.

## Key elements

- **Auth resolver registration** — installed at import time (not a boot step) into `kernel/authentication.ts`; all guarded requests pass through this port.
- **`addressForCheckout`** — the single barrel export; returns the one shipping address an order uses. This is the entire `customer-supplier` interface the cart module sees.
- **Address CRUD routes** — internal to this module; not exposed via the barrel.
- **`session/` internals** — three files (JWT signing, cookie shape, lifetimes) used only by this module; never imported by siblings.
- **Event listeners** — reacts to `user.deleted` (empties the address book) and `user.setup-requested` (sends a setup link), both emitted by `users`.
- **Dual-token scheme** — short-lived access token (in-memory) + long-lived refresh cookie (`httpOnly`); mechanics detailed in `account-sessions.md`.

## Relationships

- **`docs/modules/users.md`** — `account` reads the User record through `users`'s barrel to authenticate; `users` emits `user.deleted` / `user.setup-requested` which `account` consumes. This is the repo's only `shared-kernel` edge.
- **`docs/modules/account-sessions.md`** — companion page covering token lifetimes, cookie flags, and refresh mechanics in depth.
- **`docs/modules/cart-checkout.md`** — cart imports `addressForCheckout` from `account` (the `customer-supplier` arrow in the module graph).
- **`docs/theory/request-flow.md`** — explains where the auth guard sits in the request lifecycle; `account` is the module that answers the kernel's "who is this?" question.
- **`docs/theory/strategic-ddd.md`** — context-mapping page explaining what the `shared-kernel` relationship costs and why `account` is the only module that crosses it.
- **`docs/tools/security.md`** — documents hashing, cookie flags, and response headers that wrap the tokens `account` issues.
- **`docs/api/endpoints.md`** — lists the address-CRUD and session routes this module serves.
- **`docs/demo-ecommerce/shopper.md` / `support.md`** — demonstrate account flows (signup → login → checkout) in the e-commerce demo.
- **`docs/modules/index.md`** — module index; `account` is the central node in the dependency graph.

## Notes

- The barrel is intentionally **one line wide**. No sibling module ever imports a token primitive; if a new caller needs one, that is a design smell.
- The auth resolver is registered **at import time**, not in a boot step, because it touches no connection. Reordering imports or lazy-loading this module will silently break every guard.
- `account` owns the **address book**, not the User record. Changing the User schema is a `users` concern; changing the address shape is here.
- Token lifetimes and cookie flags are described as "breaks if you change" — every guard downstream depends on their current values.
