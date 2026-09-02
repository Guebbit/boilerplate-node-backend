# docs/modules/wishlist.md

## Purpose

Documents the wishlist module — the smallest domain in the repo. It owns one wishlist document per user that holds product references and nothing else. Serves as the simplest reference for understanding the repo's module pattern (same shape as `cart`, without checkout complexity).

## Key elements

- **One document per user** — product references only; unique index on `userId`.
- **Three outgoing imports** — `products` (line is meaningless without its product), `users` (list belongs to an account), `cart` (move-to-cart writes a cart line).
- **Two incoming domain events** — `product.deleted` (purge the line) and `user.deleted` (destroy the wishlist).
- **Move-to-cart pipeline** — save a product → wishlist → move-to-cart → cart line (qty 1 or incremented) → item leaves the wishlist.
- **No dependents** — no module imports wishlist; it is the cheapest module in the repo to remove.

## Relationships

| Neighbor | Interaction |
|---|---|
| `docs/modules/products.md` | Wishlist imports `products`; `products` emits `product.deleted` event into wishlist. |
| `docs/modules/users.md` | Wishlist imports `users`; `users` emits `user.deleted` event into wishlist. |
| `docs/modules/cart.md` | Wishlist imports `cart` for the move-to-cart write. |
| `docs/modules/index.md` | Wishlist is registered in `src/modules.ts`; removing it requires deleting that one line. |
| `docs/theory/module-lifecycle.md` | Documents the deletability procedure demonstrated by wishlist. |
| `docs/tools/events-and-logging.md` | Describes the two domain events wishlist listens for. |
| `docs/tools/analytics.md` | Tracks the save/move funnel that passes through wishlist. |
| `docs/api/endpoints.md` | API surface that exposes wishlist operations (save, list, move-to-cart). |
| `docs/demo-ecommerce/shopper.md` | Demo shopper flow exercises wishlist save and move-to-cart. |
| `docs/modules/feedback.md` | Sibling module in the same module family; no direct dependency. |

## Notes

- **Deletability is a design invariant.** Because nothing imports wishlist, removing it is `rm -rf` plus one line in `src/modules.ts` with no other changes. Use it as the test case for the module-lifecycle procedure.
- **Acyclic import graph via events.** Mutual awareness with `products` and `users` is mediated by domain events (dotted arrows), not imports, keeping the import DAG acyclic.
- **Same shape as `cart`.** If you need to understand the one-document-per-user + product-reference pattern, read wishlist first; `cart` adds checkout complexity on top of the identical skeleton.
