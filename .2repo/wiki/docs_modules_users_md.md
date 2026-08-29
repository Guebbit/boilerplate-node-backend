# docs/modules/users.md

## Purpose

Documentation for the **users** module: the leaf node in the dependency graph that owns the user record (email, password hash, admin flag, and the `tokens` subdocument for reset/refresh). It exposes no aggregate and no service—just the model and repository—because authentication and the token lifecycle are handled by the sibling `account` module.

## Key elements

- **User record** — the only data owned here: `email`, `passwordHash`, `admin`, and the `tokens` subdocument (reset + refresh tokens).
- **Barrel exports** — intentionally wide: publishes both the **model** and the **repository** (not just a service), so the `account` module can read and write the record directly.
- **`user.deleted` event** — emitted on account deletion; cart and wishlist subscribe to it rather than being called synchronously, keeping this module a graph leaf.
- **No dependencies, no aggregate, no service** — the module is `generic` and sits at the bottom of the dependency graph (five modules depend on it; it depends on none).

## Relationships

- **`cart.md` / `wishlist.md`** — both listen to the `user.deleted` event to purge the user's cart and wishlist data. This is the only outbound interaction; the module never calls them.
- **`index.md`** — the module is listed in the context-map overview; the overview links back here.

## Notes

- **Authentication is not here.** Signup, login, password reset, and the full token lifecycle live in `account.md`, a second service over the *same* collection. Do not add auth logic to this module.
- **`tokens` subdocument is a shared-kernel edge.** `account` reads and writes it; changing its shape breaks the `account` module. Treat any schema change as a cross-module contract change.
- **Wide barrel is a map edge, not a private detail.** Exposing model + repo (rather than just a service) is deliberate: it makes the dependency on `account` visible on the architecture map instead of hidden inside a re-export.
- **Two modules, one collection, by design.** `/users` and `/account` are separate URL mounts; merging them would collapse two `basePath` surfaces into one. The cost of the split is one extra `shared-kernel` arrow on the map.
