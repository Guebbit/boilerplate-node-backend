---
source: src/modules/cart/services/checkout.ts
sha256: cceea37f1abd108bc48e056e8b953ae9f6b0d4c77ebf790a26d844413b148bb4
generated_at: 2026-11-08T05:16:34.321049+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/services/checkout.ts

## Purpose

Orchestrates the cart→order transition: the single cart operation that writes to another module's collection. It resolves payment, shipping, and billing choices, validates the cart against domain rules, and places the order atomically. It exists as a dedicated service because the checkout path is the only one where a race or partial write can cost a customer money, so every step is sequenced and pre-flight-validated before any stock or order state mutates.

## Key elements

- **`toOrderAddress(address: AddressItem)`** — Maps an address-book entry to the flat object embedded in an order. Spelled field-by-field so `_id`/`default` can never leak into the order document.
- **`CheckoutChoices`** (exported type) — `Partial<CheckoutRequest>`; the buyer's optional selections (address ids, payment method, notes, expected total).
- **`PreflightOutcome<T>`** (internal type) — Discriminated union `{ ok: true } & T` | `{ ok: false; reject: ResponseReject }` used by every resolution step so callers can short-circuit without a thrown error.
- **`resolvePaymentMethod(userId, paymentMethod?)`** — Validates the chosen method against `paymentService.listPaymentMethods()`, checks `userService.purchaseHoldOf`, and enforces `maxOpenUnpaidOrdersPerAccount()`. All three must pass before any stock moves.
- **`resolveShipping(userId, addressId, shippingMethodId, basketShips)`** — Resolves the static shipping method and the shipping address. Handles digital baskets (no address), pickup methods (`requiresAddress: false`), and country allow-listing via `shipToCountries()`.
- **`resolveBilling(userId, billingAddressId, shippingAddress)`** — Resolves the invoicing address. Priority: named entry → same-as-shipping → book default. Refuses (422) if none can be produced, per EU VAT Directive Art. 226.
- **`runCheckout`** (referenced in JSDoc; body truncated) — The top-level orchestrator that calls the resolution steps above, runs `evaluateCheckout` / `evaluateShippingRequirement`, confirms availability, and delegates to `orderService.placeOrder`.

## Relationships

- **`src/domain-primitives/money.ts`** — Calls `fitsCurrency` and `toMinorUnits` to validate the buyer's `expectedTotal` against the shop currency before anything is held.
- **`src/infrastructure/http/response.ts`** — Builds every success/reject envelope via `generateSuccess`, `generateReject`, and `fieldError`.
- **`src/infrastructure/http/errors.ts`** — Wraps database-level failures with `rejectDatabaseEnvelope`.
- **`src/infrastructure/i18n/index.ts`** — Calls `t()` for all user-facing error messages and `getDefaultLocale` where needed.
- **`src/infrastructure/observability/analytics/index.ts`** — Emits checkout analytics events via `emitAnalyticsEvent` / `buildAnalyticsBase`.
- **`src/modules/addresses/service.ts`** — Calls `addressService.forCheckout(userId, id)` to look up shipping and billing entries.
- **`src/modules/addresses/model.ts`** — Consumes the `AddressItem` type.
- **`src/modules/cart/analytics.ts`** — Reads event names from `cartAnalyticsEvents`.
- **`src/modules/cart/config.ts`** — Reads `cartLineMax` and `maxOpenUnpaidOrdersPerAccount` limits.
- **`src/modules/cart/domain/index.ts`** — Calls `evaluateCheckout`, `evaluateShippingRequirement`, `needsShipping` and imports the `CheckoutVerdict`, `CheckoutShortfall`, `UnavailableCartLine` types.

## Notes

- **Pre-flight invariant:** Every resolution and validation step (`resolvePaymentMethod`, `resolveShipping`, `resolveBilling`, `evaluateCheckout`) completes *before* any stock is held or an order row is written. A failure at any step leaves the system untouched.
- **`resolvePaymentMethod` default parameter:** Uses `paymentMethod = 'card'` (not `?? 'card'`) deliberately so that a caller passing explicit `undefined`—the checkout route's "none chosen" spelling—still resolves to `card`.
- **Open-order cap is method-agnostic:** The cap check runs inside `resolvePaymentMethod` for *every* method because each unpaid order holds stock; this is the guard against one account hoarding shelf across many uncompleted orders.
- **Billing is mandatory:** Unlike shipping, there is no "no billing" path. An all-digital basket still produces a billing address (falls back to the book default), and the 422 refusal is a field-level error on `billingAddressId`.
- **`toOrderAddress` is intentionally non-generic:** It lists each field explicitly (fullName, street, city, zip, country, phone?) rather than spreading the entry, so no book-level metadata (`_id`, `default`, timestamps) can ride into the order.
