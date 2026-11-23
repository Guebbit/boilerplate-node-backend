---
source: src/modules/cart/services/view.ts
source_sha256: a502c35bd4f433c6d324c0a7c6f68479ecf4a9b3697fef13ba66266e9b3cc86d
context_sha256: 9658335804139b808d4a622c48f2de7050f94f4e093213865a228faa9c8c3d88
generated_at: 2026-11-22T04:37:16.350872+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/cart/services/view.ts

## Purpose
Turns a stored cart document into the `CartView` a caller reads. It joins cart lines to products, prices the basket, computes shipping options and the effective shipping choice, attaches per-line stock availability, and hands the result to the presenter. It is internal to `services/`; `checkout.ts` and `items.ts` share its helpers. A missing cart (`null`) is treated as an empty cart, never a 404.

## Key elements
- `CartLine` / `JoinedCartLine` / `isJoined`: a cart item plus its `product` (`Lean<ProductDocument> | null`). `JoinedCartLine` is the narrowed type where the product resolved. `isJoined` is the type guard.
- `readCartLines(cart)`: returns `[]` for a null cart. Otherwise it fetches all products with one `productService.findManyByIds` call and maps each line to `{ productId, quantity, product | null }`. It does not use Mongoose `populate()`.
- `shippingPriceFor(method, lines, currency)`: the flat rate, or free once the items total (all lines, digital included) reaches the method's `freeAbove`. Delegates to `priceShipping` and `sumLineItems`. Both the cart quote and checkout's charge use it.
- `shippingOptionsFor(joined)`: returns `{ required, options }`. If `needsShipping` is false, it returns `required: false` with no options. Otherwise it keeps the `SHIPPING_METHODS` that fit `basketWeight` and prices each one, returning `id`, `price`, `requiresAddress` and `tracked`.
- `effectiveShippingChoice(stored, options)`: returns the stored method id only if it is still among the fitting options, otherwise `undefined`. The cart view and checkout share this rule.
- `buildView` (private): assembles the view from already-joined lines and the stock positions without further reads. It does the following:
  - sums the lines;
  - picks the shipping cost (`NO_MONEY` if no method is selected);
  - maps each line to its `availability` via `lineAvailability`;
  - computes `totalPrice` with `orderTotal`;
  - passes everything to `presentCart`, along with `cartLineMax()`.
- `toCartView(cart)`: the public entry point. It reads the lines, makes one `inventoryService.availableFor` call (passing the preorder and backorder ids), then calls `buildView`.

## Relationships
- **`../model`**: supplies `CartDocument`. The cart is keyed by `userId` and carries `items` and `shippingMethodId`.
- **`../domain`** (`basketWeight`, `lineAvailability`, `needsShipping`): domain rules for weight, availability and shipping need.
- **`../presenter`**: `presentCart` and `CartView` shape the final response.
- **`../config`**: `cartLineMax()` supplies `lineMax`.
- **`./preorder`**: `availabilityProductOf`, `preorderIdsOf` and `backorderIdsOf` prepare the availability inputs and ledger lookup.
- **`@modules/delivery`**: `SHIPPING_METHODS`, `methodFitsWeight`, `priceShipping` and `StaticShippingMethod`.
- **`@modules/orders`**: `sumLineItems` and `orderTotal`.
- **`@modules/inventory`**, **`@modules/products`**, **`@modules/shop`** (`shopCurrency`): stock positions, the product lookup, and the current currency.
- **`@domain-primitives/money`**: `NO_MONEY` and `toDecimalString`.
- **`@infrastructure/persistence/create-repository`**: supplies the `Lean` type.
- **`checkout.ts`, `items.ts`**: per the header comment, these consume the helpers here.

## Notes
- `findManyByIds` is unscoped. Soft-deleted or hidden products still join. A hard-deleted product resolves to `product: null`. This lets checkout distinguish "gone" from "present but not sellable".
- A cart never freezes a currency. It always prices in the shop's current `shopCurrency()`.
- `totalPrice` comes from `orderTotal`, which works in minor units. This avoids floating-point artifacts such as 5.5600000000000005.
- `toCartView` drops the joined `product` because the OpenAPI `CartResponseItem` is `additionalProperties: false` over `{ productId, quantity, availability }`. Use `cartGet` where the joined product is needed.
- The shipping `selected` key is omitted from the view when there is no effective choice.
