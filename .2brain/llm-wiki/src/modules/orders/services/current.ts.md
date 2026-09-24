---
source: src/modules/orders/services/current.ts
sha256: 3ebf21cc26541e3f3db6f7b07273932fc0ff61fa1f5dbe8989fee0241a3426d7
generated_at: 2026-09-23T19:06:50.708051+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/services/current.ts

## Purpose

Resolves the live product image (`imageUrl` / `thumbnailUrl`) for every order line at serialization time by querying the product catalogue. It exists because the frozen snapshot on the order no longer carries image fields (removed from `orderLineProductSchema` in `../model`), so the current catalogue value must be fetched on read. All lookups in a single response are batched into one `$in` query to keep cost at one extra round-trip regardless of line count.

## Key elements

- **`OrderLineCurrent`** (type) — the payload attached to each line: `{ imageUrl: string; thumbnailUrl?: string } | null`. `null` signals the product has been hard-deleted.
- **`resolveCurrentImages<T extends OrderShape>(orders: T[]): Promise<T[]>`** — the sole exported function. Collects distinct `product.id` values across all orders, runs one `productService.findManyByIds(ids)`, then mutates each line's `current` field in place and returns the same array reference. Generic `T` preserves the caller's concrete order type.
- **`linesOf`** (internal) — safe accessor that returns `OrderLineShape[]` from an order's `items` array.
- **`distinctProductIds`** (internal) — walks every order/line and gathers unique product ids for the batched query.

## Relationships

- **`src/modules/products/index.ts`** — imports `productService` from this barrel module.
- **`src/modules/products/service.ts`** — calls `productService.findManyByIds(ids)`, a lean untransformed lookup keyed by `_id`.
- **`src/modules/orders/services/crud.ts`** — produces the serialized order shapes (admin-hydrated) that are passed into `resolveCurrentImages` as the `orders` argument.
- **`src/modules/orders/services/scope.ts`** — produces the owner-scoped serialized order shapes that are likewise passed in; both shapes agree on the `items[].product.id` contract this file reads.

## Notes

- **Mutates in place.** The caller passes a plain serialized object and owns it after the call; the function does not clone.
- **`null` is intentional.** A missing catalogue product yields `current: null`, which the frontend renders as a placeholder. Do not replace it with a fallback URL.
- **`imageUrl` non-null assertion.** Safe at runtime because `productSchema` enforces a default; the optional type is a write-path wire-contract detail only.
- **Generic bound is loose.** `OrderShape` only requires `items?: unknown`, so the function tolerates both list and single-order response envelopes without the caller needing a cast.
