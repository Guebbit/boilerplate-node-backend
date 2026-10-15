---
source: src/modules/orders/services/current.ts
sha256: f57661ecbc10f5fed6099543c25a62edb7e1eaeb5449e044e347bea3ba8b170a
generated_at: 2026-10-15T11:07:45.393326+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/services/current.ts

## Purpose

Attaches live catalogue images (`imageUrl`, `thumbnailUrl`) to each order line at the serialization boundary. The frozen order snapshot carries no image fields, so this module performs a single batched `$in` lookup against the product catalogue per response, regardless of how many orders or lines are present. It mutates the serialized order objects in-place and returns the same array.

## Key elements

- **`OrderLineCurrent`** (exported type) — `{ imageUrl?: string; thumbnailUrl?: string } | null`. `null` means the product was hard-deleted; an empty `{}` means the product exists but has no picture.
- **`OrderLineShape`** — minimal read-only shape (`product?.id`, `current?`) that this module needs from a serialized line.
- **`OrderShape`** — loose order shape with optional `items`; sufficient for both list and single-order responses.
- **`linesOf`** (private) — extracts `items` as `OrderLineShape[]`, returning `[]` if absent or non-array.
- **`distinctProductIds`** (private) — collects a deduplicated `string[]` of catalogue ids across all orders.
- **`resolveCurrentImages`** (exported, generic `<T extends OrderShape>`) — the sole public function. Skips the DB call entirely if no product ids are found. Otherwise calls `productService.findManyByIds(ids)` once, builds a `Map<id, product>`, and writes `line.current` on every line. Mutates and returns the original array.

## Relationships

- **`src/modules/products/index.ts`** — provides the `productService` import; its `findManyByIds` method is the sole data-source call in this file.
- **`src/modules/products/services/index.ts`** — implementation behind `findManyByIds`; returns lean, untransformed rows keyed by `_id`, which is all this lookup needs.
- **`src/modules/orders/services/read.ts`** / **`src/modules/orders/services/scope.ts`** — upstream producers of the serialized order shapes (admin-hydrated or owner-scoped) that are passed into `resolveCurrentImages`. Both converge on the same shape after `applyOrderTransform`, which is the contract this module reads.

## Notes

- Mutates in place and returns the same array reference; callers must treat the input as already-owned plain objects (post-serialization). Do not call this on a read-only or still-pipeline object.
- A product that exists but has neither `imageUrl` nor `thumbnailUrl` produces `{}` (not `null`). `null` is reserved exclusively for hard-deleted products. Frontend treats both as "draw placeholder."
- The `product.id` field is narrowed with `typeof === 'string'` before use; non-string ids (e.g. `ObjectId` instances that slipped through) are silently ignored rather than cast.
- The generic `<T extends OrderShape>` preserves the caller's concrete type so the returned array is assignable back without a cast.
