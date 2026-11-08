---
source: src/modules/cart/services/view.ts
sha256: 90f360baf48930753049446af2621c02798186281d0818dd8c9a49473ed056f1
generated_at: 2026-11-08T05:18:35.020356+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/services/view.ts

## Purpose

Cart projection layer: transforms a stored `CartDocument` (keyed by `userId`) into the `CartView` that the API contract declares. Shared internally by the other cart service files (`items`, `checkout`, `preorder`); none of them own this module. Treats absence of a cart document as an empty cart, never a 404.

## Key elements

- **`CartLine`** / **`JoinedCartLine`** — A cart line joined with its product. `productId` and `product` are separate fields (no Mongoose `populate`); `JoinedCartLine` narrows to lines whose product resolved.
- **`isJoined`** — Type guard narrowing `CartLine` → `JoinedCartLine`.
- **`readCartLines(cart)`** — Joins a cart's lines to products via a single `productService.findManyByIds` call. Unscoped: soft-deleted products still resolve, letting checkout distinguish "gone" from "not sellable".
- **`shippingPriceFor(method, lines, currency)`** — Computes the flat-rate or free-above-threshold cost for one shipping method against a basket's items total.
- **`shippingOptionsFor(joined)`** — Filters `SHIPPING_METHODS` by weight fit, prices each via `shippingPriceFor`, returns `{ required, options }`.
- **`effectiveShippingChoice(stored, options)`** — Validates a cart's stored method id against the current fitting options; returns `undefined` if the choice no longer applies.
- **`toCartView(cart)`** *(main export)* — Full pipeline: `readCartLines` → `inventoryService.availableFor` → `buildView`. The joined product is dropped from the final response (OpenAPI `additionalProperties: false`).
- **`buildView`** *(private)* — Assembles the `CartView` using `presentCart`, summing line items, resolving shipping, and setting per-line availability from inventory positions.

## Relationships

- **`src/modules/cart/model.ts`** — Imports `CartDocument` (the stored shape this module reads).
- **`src/modules/cart/presenter.ts`** — Imports `presentCart` and the `CartView` return type; `buildView` delegates final shaping to the presenter.
- **`src/modules/cart/domain/index.ts`** — Imports `basketWeight`, `lineAvailability`, `needsShipping` (shipping applicability, weight, per-line stock status).
- **`src/modules/cart/config.ts`** — Imports `cartLineMax` to surface the per-line quantity cap in the view.
- **`src/modules/cart/services/preorder.ts`** — Imports `availabilityProductOf`, `backorderIdsOf`, `preorderIdsOf` for inventory lookups and availability classification.
- **`src/domain-primitives/money.ts`** — Imports `NO_MONEY`, `toDecimalString` for zero-cost and formatting.
- **`src/modules/delivery/index.ts`** (→ `rates.ts`) — Imports `SHIPPING_METHODS`, `methodFitsWeight`, `priceShipping`, `StaticShippingMethod`.
- **`src/modules/inventory/index.ts`** — Imports `inventoryService.availableFor` and `StockPosition` type for the single stock read per view.
- **`src/infrastructure/persistence/create-repository.ts`** — Imports the `Lean<T>` document type used in the `product` field.
- **`src/modules/cart/services/checkout.ts`** / **`items.ts`** — Sibling consumers; share `shippingOptionsFor`, `effectiveShippingChoice`, and `readCartLines` so the cart quote and the checkout charge cannot diverge.

## Notes

- **Currency is always the shop's *current* setting** (`shopCurrency()`), never a frozen per-cart value. This differs from orders, which pin their own `currency`.
- **`totalPrice` is computed via `orderTotal`** (integer minor-unit arithmetic) rather than adding two decimal strings — avoids `5.56 + 0.00` → `5.5600000000000005`.
- **Product join is intentionally unscoped**: `findManyByIds` returns soft-deleted and hidden products. This is a deliberate design so checkout can separate "hard-deleted (absent)" from "exists but not sellable".
- **The joined `product` is discarded** before the response is returned; only `productId`, `quantity`, and `availability` survive into `CartResponseItem`.
- **`readCartLines` does not fall back to `items = []`** — the Mongoose schema default guarantees the array is present on hydrated documents.
- **`shippingOptionsFor` returns empty options** (and `required: false`) for a digital-only basket; `effectiveShippingChoice` then yields `undefined`, so no method is selectable.
