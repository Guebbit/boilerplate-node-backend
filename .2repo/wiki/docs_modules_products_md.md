# docs/modules/products.md

## Purpose

Documents the products module, which owns the shop catalogue (product CRUD) and the two stock counters (`onHand`, `reserved`) that live on every product row. It is a leaf module with zero inbound dependencies; four other domains conform to its shape rather than the reverse.

## Key elements

- **`productSchema`** — the canonical product shape. Embedded verbatim in orders, so changing it rewrites order history.
- **`onHand` / `reserved`** — stock counters stored on the product document so a catalogue read needs no join. Read-only from this module's perspective.
- **`active` + `deletedAt`** — soft-deletion pair with a restore route, preserving renderability of historical orders.
- **`active: 1, deletedAt: 1` index** — keeps the public list query cheap while the admin list still sees deleted rows.
- **`product.deleted` event** — published on the event bus; cart and wishlist subscribe to drop their references. Not an import, so the dependency arrow stays one-way.
- **`openapi.yaml`** — the module's contract fragment, merged into the root OpenAPI document.

## Relationships

- **→ `inventory.md`** — Inventory is the *only* writer of `onHand` and `reserved`. Products exposes the fields for reads; all transitions go through inventory.
- **→ `orders.md`** — Orders embed `productSchema` directly. An order's history is literally this shape; schema changes propagate to order records.
- **→ `cart.md`** — Cart listens for `product.deleted` and drops the line item.
- **→ `wishlist.md`** — Wishlist listens for `product.deleted` and removes the entry.
- **→ `index.md`** — Linked as the modules-overview / context map page.

## Notes

- **Write discipline:** A write to `onHand` or `reserved` from anywhere other than inventory is a bug, not a shortcut. The fields exist on the product document purely to avoid a join on read.
- **No inbound imports by design:** Products needs other modules to react to deletion, but does so via `product.deleted` (event) rather than calling into them. This avoids an import cycle and keeps the dependency arrow pointing one direction.
- **Soft delete, not hard:** Deletion sets `active: false` + `deletedAt`; a restore route reactivates the product. Hard-deleting would break rendering of existing orders.
