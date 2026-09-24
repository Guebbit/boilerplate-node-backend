---
source: src/modules/cart/services/view.ts
sha256: 53ab240f21fdb8360a3bb6b6d892160c657b7644c839b92bd7332e5cc4f22135
generated_at: 2026-09-23T18:33:06.882114+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/services/view.ts

## Purpose

Cart projection layer: turns a stored `CartDocument` into the shapes callers read (joined lines, API response). Shared by the other three cart service files (`checkout`, `items`, `reorder`); none of them owns this module.

## Key elements

- **`CartLine`** – `CartItem` plus a joined `product: ProductDocument | null`. `productId` and `product` are separate fields on purpose (see Notes).
- **`JoinedCartLine`** – `CartLine` narrowed to `product: ProductDocument` (non-null).
- **`CartView`** – The `CartResponse` shape from `openapi.yaml`: `items` (raw `CartItem[]`) + `summary` (`itemsCount`, `totalQuantity`, `total`). Every cart endpoint returns this.
- **`PopulatedCart`** _(internal, not exported)_ – Types what Mongoose writes into the document after `populate('items.productId')`.
- **`isJoined(line)`** – Type guard: `CartLine → JoinedCartLine` when `product !== null`.
- **`readCartLines(cart)`** – Populates product references in one query; returns `CartLine[]` with product docs or `null`. Returns `[]` for a null/absent cart.
- **`toCartView(cart)`** – Builds the full `CartView` (items + summary) using `sumLineItems`. Drops the joined product from items to match the `additionalProperties: false` contract.

## Relationships

- **`../model` (`src/modules/cart/model.ts`)** – Imports `CartDocument`; this file is the read-side projection of that document.
- **`@modules/orders` (`src/modules/orders/index.ts` → `src/modules/orders/domain/totals.ts`)** – Calls `sumLineItems` to compute the `summary` block.
- **`@modules/products` (`src/modules/products/index.ts` → `src/modules/products/model.ts`)** – Imports `ProductDocument` type for the joined field.
- **`@types` (`src/types/index.ts`)** – Imports `CartItem` (the flat line-item shape).
- **`checkout.ts`, `items.ts`, `reorder.ts`** – Import and call `toCartView` / `readCartLines` / `isJoined` to build or return cart responses after mutations.

## Notes

- **Capture-then-populate:** `readCartLines` snapshots `productId` strings _before_ calling `populate`, because Mongoose replaces the ref field with the fetched doc or `null`. The original id is restored from the snapshot array by index.
- **`PopulatedCart` key naming:** Typed as the whole `items` key (not `items.productId`) because `populate<T>` merges `T` over top-level document properties only.
- **No 404 / no empty-array guard:** A missing cart document is treated as an empty cart. `cart.items` is guaranteed non-null by the Mongoose schema default, so no `|| []` fallback is needed.
- **`toCartView` strips the product:** The joined `ProductDocument` is used for pricing but removed from the `items` array, keeping the response within the OpenAPI `additionalProperties: false` constraint. Use `readCartLines` directly when the product document is needed.
