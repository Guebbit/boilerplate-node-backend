---
source: src/modules/cart/services/checkout.ts
sha256: c377172b7e1aad7ee3c2d7ca2f3d555e1b0161322735703d2fa02b8b405456e8
generated_at: 2026-10-29T03:24:05.105948+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/services/checkout.ts

## Purpose

The checkout orchestrator for the cart module: the single cart operation that writes into another module's collection (orders). It sequences pre-flight validation (payment, shipping, billing, stock) before delegating to `orderService.placeOrder`, ensuring a race cannot overcharge or oversell. All refusals are resolved before any stock is held.

## Key elements

- **`CheckoutChoices`** (type) — `Partial<CheckoutRequest>`; the buyer's optional fields: `addressId`, `billingAddressId`, `paymentMethod`, `notes`, `expectedTotal`.
- **`PreflightOutcome<T>`** (type) — discriminated union: `{ ok: true } & T` | `{ ok: false; reject: ResponseReject }`. Every pre-flight step returns one of these two shapes.
- **`toOrderAddress`** (const fn) — projects an `AddressItem` onto the flat fields an order embeds. Deliberately excludes `_id`/`default` so they cannot leak into the order document.
- **`resolvePaymentMethod`** (async fn) — looks up the chosen method via `paymentService.listPaymentMethods()`, checks `userService.purchaseHoldOf`, and enforces `maxOpenUnpaidOrdersPerAccount` from cart config. Defaults to `'card'` when the caller passes `undefined`.
- **`resolveShipping`** (async fn) — resolves the static shipping method and the shipping address via `addressService.forCheckout`. Handles the all-digital / no-address branch, rejects a stray `addressId` when no address is required (409), and validates the country against `shipToCountries()`.
- **`resolveBilling`** (async fn) — resolves the invoice address. Falls back from named → same-as-shipping → book default; refuses with 422 `CART_BILLING_ADDRESS_REQUIRED` when none can be found (EU VAT Art. 226 requires an invoice address).
- **`runCheckout`** (referenced in JSDoc; body truncated) — the top-level orchestrator that calls the three resolvers above, runs `evaluateCheckout` / `evaluateShippingRequirement` from cart domain, checks stock via `inventoryService`, calls `orderService.placeOrder`, emits analytics, and returns a `ResponseSuccess` or `ResponseReject`.

## Relationships

- **`@domain-primitives/money`** — imports `toMinorUnits` to normalise the buyer's `expectedTotal` before comparison.
- **`@infrastructure/http/response`** — all success/reject envelopes are built with `generateSuccess`, `generateReject`, `fieldError`.
- **`@infrastructure/http/errors`** — `rejectDatabaseEnvelope` wraps unexpected DB failures into a consistent 500.
- **`@infrastructure/i18n`** — every user-facing message goes through `t()`; `getDefaultLocale` is imported (presumably for fallback formatting in the truncated section).
- **`@infrastructure/observability/analytics`** — `emitAnalyticsEvent` + `buildAnalyticsBase` record the checkout attempt.
- **`@modules/addresses/service` + `model`** — `addressService.forCheckout(userId, id?)` is the single entry point for shipping and billing address resolution; `AddressItem` is the shape used throughout.
- **`@modules/cart/config`** — `cartLineMax` caps line count; `maxOpenUnpaidOrdersPerAccount` caps how many unpaid orders may hold stock per user.
- **`@modules/cart/domain`** — `evaluateCheckout` (pre-flight verdict), `evaluateShippingRequirement` (post-join shipping check), `needsShipping`, and the `CheckoutVerdict` / `CheckoutShortfall` / `UnavailableCartLine` types drive the decision logic.
- **`@modules/cart/analytics`** — `cartAnalyticsEvents` supplies the event names passed to the analytics emitter.
- **`@modules/orders`** (imported but not a listed neighbor) — `orderService.placeOrder`, `orderTotal`, and the `OrderDocument` / `PlaceOrderInput` types are the write target.
- **`@modules/inventory`** (imported) — `inventoryService` is the stock hold/release authority.
- **`@modules/users`** (imported) — `userService.purchaseHoldOf` gates checkout behind the purchase-hold check.
- **`@modules/delivery`** (imported) — `findShippingMethod` resolves the static method by id.
- **`@modules/payments`** (imported) — `paymentService.listPaymentMethods` is the source of truth for available methods.
- **`@modules/shop`** (imported) — `shipToCountries` and `shopCurrency` constrain address validation and currency checks.

## Notes

- **Order of pre-flight steps matters.** Payment → shipping → billing → stock. An early refusal means no stock is held, no order is written. Do not reorder without checking that the later step does not depend on a value the earlier step produces.
- **`toOrderAddress` is intentionally field-by-field.** It is the only place an `AddressItem` becomes an order-embedded address. Adding a new field to the order means updating this function; the `_id` and `default` keys must never appear.
- **Billing ≠ shipping.** Every order carries a billing address (VAT requirement). For all-digital baskets the billing address still resolves (default entry) even though no shipping address exists.
- **`resolvePaymentMethod` default param trick.** The `paymentMethod = 'card'` default is on the last parameter so that a caller explicitly passing `undefined` still gets `'card'` — a deliberate choice over `?? 'card'` inside the body, documented inline.
- **Truncation.** The file continues past the visible portion (the `runCheckout` body, the unavailable-lines reject helper, and likely the final `ResponseSuccess` assembly). The page above reflects only what is present in the excerpt.
