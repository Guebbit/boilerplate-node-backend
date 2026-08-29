# docs/modules/wishlist.md

## Purpose

Documentation page for the **wishlist** module — the smallest domain in the repo. It defines one wishlist document per user holding product references, with no checkout complexity. The page exists to let readers understand the module's shape, its three one-way dependencies, and its complete independence from the rest of the system.

## Key elements

- **Shape** — one document per user, product references only, unique index on `userId`; structurally identical to the cart module minus checkout logic.
- **Three arrows (dependencies)** — `products` (a line is meaningless without its product), `users` (the list belongs to an account), `cart` (the move-to-cart exit writes a cart line, a `customer-supplier` demand on the cart's store).
- **Inbound events** — product deletion and account destruction both arrive as domain events and trigger wishlist cleanup, keeping the import graph acyclic.
- **Deletability** — nothing in the repo depends on this module; removal is `rm -rf` plus one line in `src/modules.ts`.

## Relationships

- **`docs/modules/products.md`** — wishlist holds product references; a deleted product must be removed from every wishlist via a domain event (not a direct import).
- **`docs/modules/users.md`** — wishlist is scoped to a user account; account destruction removes the wishlist via a domain event.
- **`docs/modules/cart.md`** — the move-to-cart action in wishlist writes a cart line, creating a `customer-supplier` demand on the cart store; structurally the two modules share the same document shape.
- **`docs/modules/index.md`** — the module index that registers this module in `src/modules.ts`; the only external reference that must be updated on removal.

## Notes

- The wishlist module is explicitly the **cheapest module to delete** in the codebase — zero inbound dependencies. The page recommends trying deletability here first.
- The mutual awareness between wishlist and products/users is mediated **only by domain events**, not by direct imports, which is what keeps the dependency graph acyclic.
- The page cross-references three tools pages (module lifecycle, events & logging, product analytics) for procedures and metrics beyond the module itself.
