---
source: src/modules/orders/services/current.ts
source_sha256: 387dc2d2a75d1889cfa615174980535bd2c8536cdbdf0b1440935d2f8b8881e8
context_sha256: ab7ef1aae3451683377d1eb94bb2025d94ae1e508feb71dfa78ff87b15f237e2
generated_at: 2026-11-22T06:19:50.359378+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/orders/services/current.ts

## Purpose
Resolves each order line's live product picture from the catalogue at the serialization boundary. The frozen order-line snapshot carries no `imageUrl`/`thumbnailUrl`, so this module looks them up in one batched query per response and attaches them to each line as `current`.

## Key elements
- `resolveCurrentImages(orders)` (exported): takes one or many serialized orders and collects the distinct string `line.product.id` values. If there are none, it returns the orders unchanged. Otherwise it calls `productService.findManyByIds` once, builds an id-to-product map, and sets `line.current` on each matching line. It mutates the input and returns the same array, as a `Promise`.
- `distinctProductIds` (internal): gathers the unique catalogue ids across all orders' lines. These ids make up the `$in` lookup.
- `linesOf` (internal): returns `order.items` if it is an array, otherwise `[]`.
- `OrderLineCurrent`, `OrderLineShape`, `OrderShape` (internal interfaces): deliberately loose shapes covering both list and single-order responses.

## Relationships
- Imports `productService` from `@modules/products` (`src/modules/products/index.ts`) and uses only its `findManyByIds`, which returns lean, untransformed rows keyed by `_id`.
- The neighbors `src/modules/orders/services/actions.ts`, `src/modules/orders/services/read.ts` and `src/modules/products/services/index.ts` are not imported here, and the visible content shows no direct interaction with them. The docs say the input is the already-serialized order shape, past `applyOrderTransform`. They also say both admin-hydrated and owner-scoped orders are accepted.

## Notes
- Three outcomes per line:
  - Product found with pictures: `current` has `imageUrl` and/or `thumbnailUrl`.
  - Product found with no pictures: `current` is `{}`.
  - Product hard-deleted: `current` is left absent.
  The frontend draws a placeholder in the last two cases.
- Only truthy `imageUrl`/`thumbnailUrl` values are copied.
- Lines whose `product.id` is not a string are skipped.
- The query cost is one extra query per response, regardless of the number of orders or lines.
