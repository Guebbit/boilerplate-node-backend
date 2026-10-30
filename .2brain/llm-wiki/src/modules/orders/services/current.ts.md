---
source: src/modules/orders/services/current.ts
sha256: d9358d19b9cbe2fa3210403a7412e694c8f3a6269e47a566da75ffc6181e99d1
generated_at: 2026-10-29T04:46:35.456418+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/services/current.ts

## Purpose

Attaches live product images (`imageUrl`, `thumbnailUrl`) to each order line at the serialization boundary. It exists because the frozen order snapshot (`orderLineProductSchema`) deliberately omits image URLs, so a post-serialization enrichment step is needed. It batches all referenced product IDs into a single `$in` query so a full page of orders costs one extra DB round-trip.

## Key elements

- **`resolveCurrentImages<T extends OrderShape>(orders: T[]): Promise<T[]>`** — The sole export. Collects distinct product IDs across all orders, fetches them via `productService.findManyByIds`, then mutates each line's `current` field in place and returns the same array reference.
- **`OrderLineCurrent`** — Shape of the enriched field: optional `imageUrl` and `thumbnailUrl`.
- **`OrderLineShape`** — Minimal read-side view of a serialized line (`product.id` + `current`).
- **`OrderShape`** — Loose envelope (`items?: unknown`) that covers both list and single-order response shapes.
- **`linesOf`** / **`distinctProductIds`** — Internal helpers for extracting lines and deduplicating IDs.

## Relationships

- **`src/modules/products/index.ts`** — Imported as `productService`; the module calls `productService.findManyByIds(ids)` to resolve live catalogue data.
- **`src/modules/products/services/index.ts`** — Where `productService` (and its `findManyByIds` method) is implemented; this file consumes it read-only.
- **`src/modules/orders/services/read.ts`** — Upstream caller for list and single-order read responses; `OrderShape` is intentionally loose enough to accept its output.
- **`src/modules/orders/services/actions.ts`** — Upstream caller for mutation responses (e.g. admin-hydrated order updates); this module is shape-agnostic to the calling context.

## Notes

- **Mutates in place.** `resolveCurrentImages` returns the *same* array it receives. Callers must not alias the input expecting immutability.
- **Three states of `current`:** absent → product hard-deleted; `{}` → product exists but has no images; populated → at least one image URL present. The frontend treats the first two identically (placeholder).
- **Non-string `product.id` values are silently skipped** (the `typeof … === 'string'` guard). No error or log is emitted.
- **Uses `findManyByIds`** (lean, untransformed rows) rather than a full product query, since only `_id`, `imageUrl`, and `thumbnailUrl` are read.
- **Early-exit:** if no valid product IDs are found, the function returns `Promise.resolve(orders)` with zero DB calls.
