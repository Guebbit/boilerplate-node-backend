# docs/modules/users.md

## Purpose

Documents the `users` module, which owns the user record (email, password hash, admin flag, reset/refresh tokens) and publishes its model and repository. It is a generic, dependency-free leaf at the bottom of the module graph; authentication and the token lifecycle live in the sibling `account` module rather than here.

## Key elements

- **User model** – the core record: `email`, password hash, `admin` flag, and a `tokens` subdocument.
- **Repository** – exposed through the module barrel so the sibling `account` module can read and write the record directly.
- **`tokens` subdocument** – the repo's only shared-kernel edge; `account` reads and writes it.
- **`user.deleted` event** – emitted on account deletion so dependent modules (cart, wishlist) can clean up without this module depending on them.
- **Barrel exports** – the widest in the repo: publishes model *and* repository (not just a service), because a sibling genuinely needs write access to the record.

## Relationships

- **`account`** – a second service over the same collection. Reads/writes the `tokens` subdocument and handles signup, login, password reset, and the full token lifecycle. The two modules are kept separate because they occupy different URL mounts (`/users` vs `/account`) and a manifest carries one `basePath`.
- **`cart-checkout`** – listens to `user.deleted` to empty the user's cart.
- **`wishlist`** – listens to `user.deleted` to clear the user's wishlist.
- **`index.md`** – the module appears as a leaf node (zero outgoing dependencies, five incoming) in the context map.
- **`strategic-ddd.md`** – explains why the wide barrel (model + repository) is a visible map edge rather than a private detail.
- **`security.md`** – documents password hashing strategy and the token shapes stored in the `tokens` subdocument.
- **`events-and-logging.md`** – covers the `user.deleted` event and its three listeners.

## Notes

- **No aggregate lives here.** The record is deliberately `generic`; central feel does not justify an aggregate.
- **The `tokens` subdocument is the only cross-module write path.** Changing its shape breaks `account` and is the sole shared-kernel edge in the repo.
- **Why two modules, not one:** merging `/users` and `/account` would collapse two URL surfaces into one module for no gain. The cost of the split is one visible `shared-kernel` arrow on the dependency map.
- **Deletion is event-driven, not cascading.** Emptying cart/wishlist travels as `user.deleted` so this module stays a leaf (zero outgoing dependencies).
