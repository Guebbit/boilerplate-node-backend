---
source: src/modules/cart/services/view.ts
sha256: 78f5a45747e0c1d4973efb0eda2d5e3218d9f733d801ee34ad1b4115bb63115f
generated_at: 2026-10-14T15:13:50.890683+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/services/view.ts

## Purpose

Cart projection: transforms a stored `CartDocument` into the `CartView` shape that `openapi.yaml` declares as the cart response. It joins cart lines to their products, computes line availability, prices shipping, and assembles the summary — all in one pipeline that every cart endpoint (reads and mutation payloads) returns. Lives inside `services/` and is shared by the sibling service files (`checkout`, `items`, `merge`, `reorder`, `preorder`) rather than owned by any one of them.

## Key elements

- **`CartLine`** / **`JoinedCartLine`** — A cart line joined with its product. `productId` and `product` are kept as separate fields (not a Mongoose `populate`) so the lookup key is preserved alongside the result. `JoinedCartLine` narrows to lines whose product resolved.
- **`CartView`** — The wire-format cart: `items`, `summary` (counts, totals, shipping cost, currency), and `shipping` (required flag, selected method, available options).
- **`isJoined(line)`** — Type guard narrowing `CartLine` → `JoinedCartLine`.
- **`readCartLines(cart)`** — Joins cart lines to products via a single `productService.findManyByIds` `$in` query. Returns `[]` for a null cart. Soft-deleted/hidden products still join (distinguishes "gone" from "not sellable").
- **`shippingPriceFor(method, lines, currency)`** — Prices one shipping method for a basket: flat rate, or free once the items total reaches the method's `freeAbove` threshold.
- **`shippingOptionsFor(joined)`** — Filters `SHIPPING_METHODS` by basket weight, prices each via `shippingPriceFor`, returns `{ required, options }`. Empty options when the basket is digital-only.
- **`effectiveShippingChoice(stored, options)`** — Validates a stored shipping-method id against the current fitting options; returns `null` if the choice no longer applies (e.g. basket went digital-only).
- **`buildView(cart, lines, available)`** *(private)* — Assembles the full `CartView` from already-joined lines and an availability map. Prices against the shop's *current* currency (not a frozen one). Uses `orderTotal` to avoid float artifacts.
- **`toCartView(cart)`** — Public entry point. Chains `readCartLines` → `inventoryService.availableFor` → `buildView`. The joined `product` field is dropped from the response (contract is `additionalProperties: false` over `productId`, `quantity`, `availability`).

## Relationships

- **`../model`** — Imports `CartDocument` (the stored shape being projected).
- **`../domain`** (re-exports from `domain/rules.ts`) — Uses `basketWeight`, `lineAvailability`, `needsShipping` for weight/availability logic.
- **`./preorder`** — Imports `availabilityProductOf` and `preorderIdsOf` to resolve per-line availability and pass preorder product ids to the inventory check.
- **`@modules/delivery`** (via `domain/rates.ts`) — Consumes `SHIPPING_METHODS`, `methodFitsWeight`, `priceShipping`, and the `StaticShippingMethod` type for option filtering and pricing.
- **`@modules/inventory`** — Calls `inventoryService.availableFor` (same source used by checkout and merge) to get live stock units.
- **`@infrastructure/persistence/create-repository`** — Imports the `Lean<T>` type used to type the joined product.
- **`@modules/orders`** (external) — Imports `orderTotal`, `sumLineItems`, `shopCurrency` for pricing and currency.
- **Sibling services** (`checkout`, `items`, `merge`, `reorder`) — Import this module's exports (especially `readCartLines`, `toCartView`, `isJoined`, `shippingOptionsFor`, `effectiveShippingChoice`) rather than duplicating the join/price logic. None of them owns this file.

## Notes

- Absence and emptiness are the same state: a null cart yields an empty `CartView`, never a 404. Callers never need to distinguish "no cart" from "cart with zero items."
- Currency is always the shop's *current* setting (`shopCurrency()`), because a cart has not yet frozen a currency. This differs from orders, which carry their own frozen `currency`.
- `productService.findManyByIds` is intentionally unscoped (no `active`/`deletedAt` filter), so checkout can distinguish hard-deleted products (absent from the result) from soft-deleted ones (present but not sellable).
- `totalPrice` is computed via `orderTotal` in minor units to avoid floating-point drift (e.g. `5.5600000000000005`).
- The joined `product` field is internal to the projection; it is stripped before the response is returned, matching the `additionalProperties: false` contract in `openapi.yaml`.
- The shipping option list and the checkout charge both derive from `shippingPriceFor`, so they cannot disagree.
