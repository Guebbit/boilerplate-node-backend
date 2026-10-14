---
source: src/modules/cart/services/checkout.ts
sha256: 2e3521d8b50ba4c27329743c8c4189c8bd859cc4fac2a91f74bc2d129bd0d7f3
generated_at: 2026-10-14T15:10:52.938645+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/services/checkout.ts

## Purpose

Implements the cart checkout flow — the single cart operation that writes into another module's (orders) collection and where a race can cost the customer money. It resolves payment method, shipping, and billing addresses; validates stock and totals; then delegates the actual order write to `placeOrder`. All pre-flight checks refuse before anything is persisted.

## Key elements

- **`toOrderAddress`** – Maps an `AddressItem` to the address shape an order embeds. Spelled field-by-field so the entry's `_id`/`default` cannot leak into the order document.
- **`CheckoutChoices`** (exported) – The buyer's optional checkout parameters: `addressId`, `billingAddressId`, `paymentMethod`, `notes`, `expectedTotal`.
- **`PreflightOutcome<T>`** – Discriminated union: either `{ ok: true } & T` or `{ ok: false; reject: ResponseReject }`. Used by every pre-flight resolver.
- **`resolvePaymentMethod`** – Validates the chosen method against `paymentService.listPaymentMethods()` and enforces `maxOpenUnpaidOrdersPerAccount`. Defaults to `'card'`.
- **`resolveShipping`** – Resolves the shipping method and shipping address (or confirms neither is needed). Refuses an explicit `addressId` when nothing ships to an address.
- **`resolveBilling`** – Resolves the billing address (named → same-as-shipping → default). Every order must carry one (EU VAT Art. 226).
- **`StockRefusal` / `buildStockRefusal`** – Unified shape for stock-related refusals; produces the wire-level `ResponseReject` with appropriate 404 (pre-flight) or 409 (post-`placeOrder`) status.
- **`runCheckout`** (referenced in docs, truncated) – The main orchestration entry point that sequences pre-flight, stock, and order-write steps.

## Relationships

- **`@infrastructure/http/response`** – `generateSuccess` / `generateReject` build every HTTP response this file returns.
- **`@infrastructure/http/errors`** – `rejectDatabaseEnvelope` formats unexpected database failures into the standard error shape.
- **`@infrastructure/i18n`** – `t()` localises every user-facing error message; `getDefaultLocale` selects the catalog.
- **`@infrastructure/observability/analytics`** – `emitAnalyticsEvent` / `buildAnalyticsBase` fire checkout analytics events.
- **`../analytics`** – `cartAnalyticsEvents` supplies the event names/payloads for checkout-specific tracking.
- **`../config`** – `cartLineMax` and `maxOpenUnpaidOrdersPerAccount()` provide the runtime limits enforced here.
- **`../domain`** – `evaluateCheckout`, `evaluateShippingRequirement`, `needsShipping`, and the `CheckoutShortfall` / `UnavailableCartLine` types supply the business-rule verdicts.
- **`../repository`** – `cartRepository` reads and clears the cart lines after a successful (or failed) checkout.
- **`@modules/addresses`** – `addressForCheckout` resolves a book entry to an `AddressItem`; the `AddressItem` type is the address shape used throughout.

## Notes

- The file is the *only* cart service that crosses a module boundary to write (into orders). Treat any change to its write-path ordering as a potential money-loss regression.
- `expectedTotal` (minor units) acts as an optimistic lock on price: if the computed total differs from what the buyer saw, checkout is refused with `CART_TOTAL_CHANGED` before stock is held.
- `resolvePaymentMethod` defaults `paymentMethod` to `'card'` via a parameter default (not `??`), so passing `undefined` from the route yields `'card'` without extra branching.
- Stock refusals use *different* HTTP statuses depending on *where* the check fired (404 pre-flight vs 409 post-`placeOrder`) while keeping the same message shape — this is intentional and preserved across both call sites.
- `toOrderAddress` is deliberately non-exhaustive: it picks only the fields the order needs, preventing `_id`, `default`, or future book-internal fields from leaking into the order snapshot.
