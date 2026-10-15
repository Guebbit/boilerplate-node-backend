---
source: src/modules/wishlist/module.ts
sha256: ab76a28255c299c947b73d83f0c391f99fd3bf2cd89f5f25a2ef1019a5a693e7
generated_at: 2026-10-15T12:26:31.372327+00:00
model: ollama:qwen3.8:27b
---

# src/modules/wishlist/module.ts

## Purpose

Module manifest for the wishlist feature. Registers the wishlist's HTTP routes, a `PRODUCT_DELETED` event subscription (to purge stale product references), and a personal-data hook pair (`collect` / `erase`) so the account module can export or permanently delete a user's saved items without importing wishlist directly.

## Key elements

- **`default` export (`AppModule`)** — The single exported object, type-checked with `satisfies AppModule`. Fields:
  - `name` / `basePath` — Module identifier (`'wishlist'`) and route prefix (`/wishlist`).
  - `routes` — The Hono (or equivalent) router re-exported from `./routes`.
  - `personalData[0]` — One entry with `collect` (calls `wishlistService.wishlistExportLines`) and `erase` (calls `wishlistDeleteByUserId`). The `erase` function joins the caller's hard-delete transaction.
  - `subscribe` — Subscribes to `PRODUCT_DELETED`; on fire, calls `productRemoveFromWishlistsById(productId, titles)` to strip the deleted product from every user's wishlist.
  - `locales` — Path to a sibling `locales/` directory, resolved via `path.join(__dirname, 'locales')`.

## Relationships

- **`src/kernel/registry.ts`** — Provides the `AppModule` type that shapes the default export.
- **`src/kernel/events.ts`** — Provides `onDomainEvent`, used inside `subscribe` to listen for domain events.
- **`src/modules/products/index.ts`** — Source of the `PRODUCT_DELETED` event constant (imported as `@modules/products`).
- **`src/modules/wishlist/routes.ts`** — Supplied as `routes` on the manifest.
- **`src/modules/wishlist/service.ts`** — Supplies `wishlistService`, `wishlistDeleteByUserId`, and `productRemoveFromWishlistsById`.
- **`src/modules/account/module.yaml`** — Downstream consumer: the account module's personal-data flow invokes this module's `collect`/`erase` hooks at runtime; no static import exists here (keeps the import graph acyclic).
- **`src/modules.ts`** — Likely the aggregation point that imports this default export to assemble the full app.
- **`src/modules/wishlist/module.yaml`** — Static metadata manifest colocated with this file.

## Notes

- `erase` does **not** run in its own transaction; the comment states it "joins the caller's own hard-delete transaction." The calling side (account module) is responsible for transaction boundaries.
- The `subscribe` closure captures `titles` from the event payload and passes it to the cleanup function, presumably for a user-facing notification or log line.
- No business rules (max items, dedup, etc.) live in this file or are modelled here per the header comment — the module is intentionally thin.
- `locales` is resolved relative to `__dirname`, so it breaks if the file is bundled in a way that changes `__dirname` (e.g., certain ESM transpilation targets).
