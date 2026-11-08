---
source: src/modules/orders/services/current.ts
sha256: d9358d19b9cbe2fa3210403a7412e694c8f3a6269e47a566da75ffc6181e99d1
generated_at: 2026-11-08T06:56:53.220459+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/services/current.ts

## Purpose

Resolves each order line's live product images (`imageUrl`, `thumbnailUrl`) from the catalogue at the serialization boundary. It exists because the frozen order snapshot schema (`orderLineProductSchema`) deliberately omits image fields, so callers need a single, batched lookup that enriches serialized orders just before they leave the API layer.

## Key elements

- **`resolveCurrentImages<T extends OrderShape>(orders: T[]): Promise<T[]>`** — The sole export. Collects all distinct catalogue `product.id` values across the passed-in orders, issues one `findManyByIds` query, then mutates each line in place to attach a `current` object (or leaves it absent if the product was hard-deleted). Returns the same array it received.
- **`OrderLineCurrent`** — Shape of the attached field: optional `imageUrl` and `thumbnailUrl`.
- **`OrderLineShape` / `OrderShape`** — Minimal structural types describing what this module reads from a serialized order line and order shell, keeping the generic `<T>` contract loose enough for both list and single-order responses.
- **`linesOf`** — Narrows an order's `items` to `OrderLineShape[]`, returning `[]` if `items` is not an array.
- **`distinctProductIds`** — Builds a deduplicated `Set` of string ids across all orders, ready for the `$in` query.

## Relationships

- **`src/modules/products/index.ts`** — Provides `productService`, which this file imports. The call used is `productService.findManyByIds(ids)`, returning lean, untransformed rows keyed by `_id`.
- **`src/modules/products/services/index.ts`** — Implementation behind that `findManyByIds` call; this file depends only on its contract (ids in, product docs out).
- **`src/modules/orders/services/actions.ts`** and **`src/modules/orders/services/read.ts`** — Upstream callers that serialize orders and then pass the result array through `resolveCurrentImages` before the response is sent. Both shapes (admin-hydrated, owner-scoped) are compatible because this module only reads `items[].product.id`.

## Notes

- **Mutates in place.** The caller must treat the returned array as its own; there is no clone step. This is intentional—the input is already a fresh, serialized shape owned by the caller.
- **One query per response.** No matter how many orders or lines are in the batch, exactly one `findManyByIds` call fires (or zero if no lines reference a product id).
- **Absent vs. empty `current`.** A hard-deleted catalogue product means `current` is never set on that line. A live product with no image fields yields `current: {}`. The frontend renders the same placeholder in both cases, so callers need not distinguish.
- **Id type guard.** Only values where `typeof line.product?.id === 'string'` are collected and resolved; numeric or missing ids are silently skipped.
