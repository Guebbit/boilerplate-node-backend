# docs/modules/products.md

## Purpose

Documents the **products** module — the shop's catalogue and the leaf domain that `cart`, `inventory`, `orders`, and `wishlist` all conform to. It defines what a product looks like (`productSchema`), how soft deletion works, and the one domain event (`product.deleted`) that lets this module reach back into other modules without importing them.

## Key elements

- **`productSchema`** — the Mongoose schema for a product row. `orders` embeds this shape directly, so schema changes are order-breaking.
- **`onHand` / `reserved`** — stock counters stored on the product document so a catalogue read needs no join. **This module never writes them**; `inventory` is the sole writer.
- **`active` + `deletedAt`** — soft-deletion pair. A product row is never hard-removed so embedded order history still renders.
- **`active: 1, deletedAt: 1` compound index** — keeps the public product list query cheap while the admin list can still see inactive rows.
- **`product.deleted` domain event** — emitted on soft delete; `cart` and `wishlist` listen and drop the stale line. Avoids an import cycle.
- **Redis cache invalidation** — runs as part of the delete path alongside the event emission.

## Relationships

- **`cart` / `cart-checkout`** — imports products for reads; listens to `product.deleted` to remove matching cart lines.
- **`wishlist`** — same pattern: reads products, listens to `product.deleted` to purge entries.
- **`inventory` / `inventory-reservations`** — imports products for reads; is the **only** module that writes `onHand` and `reserved`.
- **`orders`** — embeds `productSchema` in its items; a shape change here is a breaking change for stored orders.
- **`index.md` (modules)** — positions products as the central `core` node in the dependency graph.
- **`events-and-logging.md`** — describes the bus on which `product.deleted` travels.
- **`strategic-ddd.md`** — explains why the four inbound arrows are labelled `conformist`.
- **`contract-fragmentation.md`** — documents how this module's `openapi.yaml` fragment is merged into the root OpenAPI document.
- **`mongodb-mongoose.md`** — background on the repository/model patterns this module uses.
- **`demo-ecommerce/manager.md`** — exercises the module in the demo flow.

## Notes

- **Field-ownership split:** `onHand` and `reserved` *live* on the product document but are *owned* by `inventory`. Any write to those fields outside the inventory transition is a bug, not a shortcut.
- **No outbound imports:** products deliberately depends on nothing. The `product.deleted` event exists precisely so the "reach back" (cart/wishlist cleanup) stays a one-way arrow.
- **Schema is a contract:** because `orders` embeds it, treat `productSchema` changes as a migration-level concern, not a local refactor.
