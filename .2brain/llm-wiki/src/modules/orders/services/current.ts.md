---
source: src/modules/orders/services/current.ts
sha256: 30ec9b9b1b1d30ba3a7182cc8917819033cdecf04625f6bdebaa7461b7a3c578
generated_at: 2026-09-27T15:13:47.069144+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/services/current.ts

## Purpose

Attaches live catalogue images (`imageUrl`, `thumbnailUrl`) to each order line at the serialization boundary. The order model's `orderLineProductSchema` intentionally carries no image fields, so this module fetches them from the product catalogue in a single batched `$in` query per response, replacing the frozen (image-less) snapshot with the product's current picture.

## Key elements

- **`OrderLineCurrent`** (type) — `{ imageUrl: string; thumbnailUrl?: string } | null`; the live image payload or an explicit "product gone" signal.
- **`OrderLineShape`** / **`OrderShape`** (internal interfaces) — minimal structural types that let the module read a product id out of either a list or a single-order serialized shape without importing the full model.
- **`linesOf`** (internal helper) — safely narrows `order.items` to `OrderLineShape[]`, returning `[]` for non-array shapes.
- **`distinctProductIds`** (internal helper) — collects the set of unique catalogue `product.id` strings across every order/line in the response.
- **`resolveCurrentImages<T extends OrderShape>`** (exported) — the sole public entry point. Runs one `productService.findManyByIds(ids)` call, then mutates each line's `current` field in-place and returns the same array. Skips the query entirely when no ids are found.

## Relationships

- **`src/modules/products/index.ts`** — imported as `productService`; provides `findManyByIds` (a lean, untransformed `find({_id: {$in}})` lookup).
- **`src/modules/products/service.ts`** — the concrete implementation behind the `productService` import; this file only calls `findManyByIds`.
- **`src/modules/orders/services/crud.ts`** — expected caller for admin-hydrated order responses; `resolveCurrentImages` is designed to accept that shape.
- **`src/modules/orders/services/scope.ts`** — expected caller for owner-scoped order responses; both shapes agree past `applyOrderTransform`, which is the only contract this module relies on.

## Notes

- **Mutates in place.** The caller must already own the plain serialized object; no clone is made. Return type `T[]` is the same array reference.
- **`null` is intentional.** `current: null` is the frontend's signal that the product was hard-deleted — it is *not* a backend fallback or an empty image.
- **`imageUrl!` assertion is safe.** The product schema assigns a default at write time, so a stored product always has `imageUrl`. The optional type exists only for the wire contract on writes.
- **One query, not N.** Regardless of how many orders or lines are in the response, at most one `findManyByIds` call is issued.
- **Generic `<T extends OrderShape>`** means the function is type-transparent: it preserves the caller's concrete order type (list item, single-order wrapper, etc.) without any cast.
