---
source: src/modules/cart/services/checkout.ts
sha256: 0ac7d7766317a6ffe3dd5087b561512d8fef47e1e41d99d20f4843dc36dea273
generated_at: 2026-11-14T19:30:44.865030+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/services/checkout.ts

## Purpose

Orchestrates the checkout flow — the single cart operation that writes into another module's collection (orders) and the only one where a race can cost a customer money. It runs pre-flight validations (payment, address, shipping) that refuse the request *before* any stock is held, then delegates to the order, inventory, and payment services to complete the purchase.

## Key elements

- **`toOrderAddress`** — Copies only the fields listed in `POSTAL_ADDRESS_FIELDS` from an `AddressItem` into an `OrderAddress`, so book-specific fields (`_id`, `default`) never leak into the stored order.
- **`CheckoutChoices`** — Type alias for `Partial<CheckoutRequest>`; the set of buyer-supplied fields (`addressId`, `billingAddressId`, `paymentMethod`, `notes`, `expectedTotal`).
- **`PreflightOutcome<T>`** — Discriminated union (`{ ok: true } & T` / `{ ok: false; reject: ResponseReject }`) used by every pre-flight step so `runCheckout` can short-circuit uniformly.
- **`resolvePaymentMethod`** — Validates the chosen method against `paymentService.listPaymentMethods()`, checks the user's purchase hold, and enforces the `maxOpenUnpaidOrdersPerAccount` cap. Defaults to `'card'` via a parameter default.
- **`resolveShipping`** — Resolves the shipping method (via `findShippingMethod`) and the shipping address (via the addresses service). Returns 409 if an address is sent for a no-address method, 404 if the entry is missing, 422 if the country is outside `shipToCountries()`.
- **`resolveBilling`** — Resolves the billing address with a three-way fallback: named → same-as-shipping → book default. Refuses with 422 `CART_BILLING_ADDRESS_REQUIRED` when none exists (mandatory per EU VAT Directive Art. 226).
- **`runCheckout`** *(truncated in view)* — The exported entry point that sequences the pre-flight steps, calls `evaluateCheckout` / `evaluateShippingRequirement`, and commits the order.

## Relationships

- **`src/domain-primitives/money.ts`** — Uses `fitsCurrency` and `toMinorUnits` for the `expectedTotal` guard and price arithmetic.
- **`src/domain-primitives/postal-address.ts`** — Iterates `POSTAL_ADDRESS_FIELDS` in `toOrderAddress` to build the order snapshot.
- **`src/infrastructure/http/response.ts`** — Builds every success/reject envelope (`generateSuccess`, `generateReject`, `fieldError`).
- **`src/infrastructure/http/errors.ts`** — Uses `rejectDatabaseEnvelope` for unexpected DB failures during the write path.
- **`src/infrastructure/i18n/index.ts`** / **`catalog.ts`** / **`context.ts`** — Calls `t()` for every user-facing message and `getDefaultLocale` for locale resolution.
- **`src/infrastructure/observability/analytics/index.ts`** — Emits `cartAnalyticsEvents` via `emitAnalyticsEvent` / `buildAnalyticsBase` at key checkout milestones.
- **`src/modules/addresses/service.ts`** — Resolves shipping and billing address entries from the caller's address book.
- **`src/modules/addresses/model.ts`** — Consumes the `AddressItem` type for resolved entries.
- **`src/modules/cart/analytics.ts`** — Imports the `cartAnalyticsEvents` constant that names the event payloads.
- **`src/modules/cart/config.ts`** — Reads `cartLineMax` and `maxOpenUnpaidOrdersPerAccount` limits.
- **`src/modules/cart/domain/index.ts`** — Calls `evaluateCheckout`, `evaluateShippingRequirement`, `needsShipping`, and consumes `CheckoutVerdict`, `CheckoutShortfall`, `UnavailableCartLine` types.
- **`src/modules/orders`**, **`src/modules/inventory`**, **`src/modules/users`**, **`src/modules/delivery`**, **`src/modules/payments`** — Downstream services called during the commit phase (order creation, stock hold, purchase-hold check, shipping-method lookup, payment-method listing).

## Notes

- Every pre-flight step is designed to **refuse before any stock is held**; the file header explicitly calls out the money-cost of a race.
- `resolveShipping` returns `address: undefined` (not an error) when a physical basket simply hasn't picked a method yet — that case is refused later by `evaluateShippingRequirement` as `CART_SHIPPING_METHOD_REQUIRED`.
- The billing fallback order is **named → shipping → default**, but an *all-digital* basket with no default entry is a hard 422, not a silent skip.
- `toOrderAddress` intentionally does **not** copy phone (it is absent from the address book model), and the single `as OrderAddress` cast relies on the book guaranteeing the five required fields.
- The `paymentMethod = 'card'` default is a **parameter default** (not `?? 'card'`), so callers passing `undefined` explicitly still get `'card'` — this is load-bearing for the checkout route's "none chosen" spelling.
