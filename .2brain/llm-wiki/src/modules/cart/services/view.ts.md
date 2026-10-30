---
source: src/modules/cart/services/view.ts
sha256: e3d8f0f1c178c976c3eb556a556ded5a50cff4070d72c9216454963b5110175f
generated_at: 2026-10-29T03:26:07.067961+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/services/view.ts

## Purpose

Cart projection layer: turns a stored `CartDocument` into the `CartView` that API responses and sibling services consume. It is internal to `services/` and shared by `checkout.ts`, `items.ts`, and `preorder.ts` rather than owned by any one of them. Every operation is a single addressed read; absence and emptiness are equivalent (no 404).

## Key elements

- **`CartLine`** — `CartItem` extended with `product: Lean<ProductDocument> | null`. The id and the joined document are kept as separate fields on purpose (service-level join, not Mongoose `populate`).
- **`JoinedCartLine`** / **`isJoined`** — type + guard narrowing to lines whose product resolved; the subset an order may be built from.
- **`readCartLines`** — one `productService.findManyByIds` call for all line ids; returns `CartLine[]` with `null` for unresolvable ids. Unscoped: soft-deleted/hidden products still join so checkout can distinguish "gone" from "not sellable".
- **`shippingPriceFor`** — flat rate or zero once the basket's items total reaches the method's `freeAbove`. Shared by the cart quote and the checkout charge so they cannot disagree.
- **`shippingOptionsFor`** — filters `SHIPPING_METHODS` by `methodFitsWeight`, prices each via `shippingPriceFor`, and reports whether shipping is required at all.
- **`effectiveShippingChoice`** — returns the stored method id only if it is still in the current fitting-options list; otherwise `undefined`.
- **`buildView`** (private) — assembles the full `CartView`: sums lines, computes shipping, derives per-line `availability`, and delegates to `presentCart`. Prices in `shopCurrency()` (the cart has no frozen currency).
- **`toCartView`** — public entry point: `readCartLines` → `inventoryService.availableFor` (preorder + backorder ids) → `buildView`. The joined product is dropped before the response (OpenAPI schema is `additionalProperties: false`).

## Relationships

- **`../model.ts`** — source of the `CartDocument` shape that every function here reads.
- **`../presenter.ts`** — `presentCart` maps the assembled data into the final `CartView`; `CartView` is the return type of `toCartView`.
- **`../config.ts`** — provides `cartLineMax`, surfaced as `lineMax` in the view.
- **`../domain/` (`availability.ts`, `rules.ts`)** — `lineAvailability`, `basketWeight`, `needsShipping` supply the per-line stock state and shipping applicability checks.
- **`./preorder.ts`** — `availabilityProductOf`, `preorderIdsOf`, `backorderIdsOf` feed the inventory lookup and the availability computation.
- **`@modules/delivery`** (barrel → `domain/rates.ts`) — `SHIPPING_METHODS`, `methodFitsWeight`, `priceShipping`, `StaticShippingMethod` define the catalogue of methods and the pricing math.
- **`@modules/inventory`** (services/index) — `inventoryService.availableFor` returns `StockPosition[]` for the whole cart in one call; `StockPosition` is the per-product stock shape used in `buildView`.
- **`@infrastructure/persistence/create-repository.ts`** — `Lean<T>` generic used to type the joined product without a full hydrated document.
- **`@modules/orders`** — `orderTotal` (minor-unit-safe total) and `sumLineItems` (count / quantity / price) are reused so cart and order share identical arithmetic.
- **`src/modules/cart/services/checkout.ts`**, **`items.ts`** — sibling services that import and reuse `isJoined`, `shippingOptionsFor`, `effectiveShippingChoice`, `readCartLines`, and `toCartView` rather than duplicating the logic.

## Notes

- The join is deliberately a service-level `findManyByIds`, not a Mongoose `populate`. The `productId` on the line is preserved alongside the resolved document (see strategic DDD doc §5).
- `totalPrice` uses `orderTotal` (integer minor units) to avoid floating-point artefacts like `5.5600000000000005` when the cart total and the shipping cost are both decimals.
- The cart prices in the shop's **current** `shopCurrency()`; it never freezes a currency because it has not yet checked out. An order, by contrast, carries its own frozen `currency`.
- `shippingOptionsFor` returns an empty `options` array when `needsShipping` is false; `effectiveShippingChoice` will then always return `undefined`, so no method can be "selected" on a digital-only cart.
- `toCartView` is the only exported async function that does an I/O round-trip for inventory; `buildView` itself is pure given its inputs.
