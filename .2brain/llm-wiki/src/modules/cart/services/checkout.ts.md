---
source: src/modules/cart/services/checkout.ts
sha256: 6d1656c318cd0f2ba2bddde0b8eb0977f1cba2dffb875100b2f80c7aa0c16aca
generated_at: 2026-10-15T10:24:18.026746+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/services/checkout.ts

## Purpose

The checkout service for the cart module. It is the single cart operation that writes into another module's collection (orders) and the only one where a race condition can cost a customer money. It orchestrates the full pre-flight → place-order → confirm flow: resolving payment method, shipping, and billing; evaluating the basket against domain rules; calling `placeOrder`; and emitting analytics.

## Key elements

- **`CheckoutChoices`** – Interface describing the buyer's optional selections: `addressId`, `billingAddressId`, `paymentMethod`, `notes`, `expectedTotal`.
- **`PreflightOutcome<T>`** – Discriminated union (`{ ok: true } & T` | `{ ok: false; reject }`) used by every pre-flight resolver to signal "proceed" or "refuse now, nothing written yet".
- **`resolvePaymentMethod`** – Validates the chosen method against `paymentService.listPaymentMethods()` and enforces `maxOpenUnpaidOrdersPerAccount`; refuses with 409 before any stock is held.
- **`resolveShipping`** – Resolves the shipping method (via `findShippingMethod`) and shipping address (via `addressForCheckout`); handles all-digital baskets, pickup (`requiresAddress: false`), and unsupported ship-to countries.
- **`resolveBilling`** – Resolves the invoice address following the priority: explicit `billingAddressId` → same-as-shipping → default book entry. Every order carries one (EU VAT Directive Art. 226).
- **`toOrderAddress`** – Maps an `AddressItem` to a flat address object for the order document, explicitly listing each field so `_id`/`default` never leak into the order.
- **`StockRefusal`** / **`buildStockRefusal`** – Unified shape and wire-level reject builder for the two stock-failure modes (`insufficient-stock` vs `unavailable`), which can originate from either the pre-flight check or `placeOrder`'s write.

## Relationships

- **`src/infrastructure/http/response.ts`** – Uses `generateReject`, `generateSuccess`, `fieldError`, and the `ResponseSuccess`/`ResponseReject` types to shape every HTTP response.
- **`src/infrastructure/http/errors.ts`** – Imports `rejectDatabaseEnvelope` for database-level failure envelopes.
- **`src/infrastructure/i18n/index.ts`** – Imports `t` (and `getDefaultLocale`) to produce localised error messages and customer-facing strings.
- **`src/infrastructure/observability/analytics/index.ts`** – Calls `emitAnalyticsEvent` and `buildAnalyticsBase` to record checkout outcomes.
- **`src/modules/cart/analytics.ts`** – Imports `cartAnalyticsEvents` for the event names/payloads emitted during checkout.
- **`src/modules/cart/config.ts`** – Reads `cartLineMax` and `maxOpenUnpaidOrdersPerAccount` as enforcement limits.
- **`src/modules/cart/domain/index.ts`** – Calls `evaluateCheckout`, `evaluateShippingRequirement`, and `needsShipping`; consumes `CheckoutShortfall` and `UnavailableCartLine` types.
- **`src/modules/cart/repository.ts`** – Uses `cartRepository` to read the caller's cart lines for the checkout evaluation.
- **`src/modules/addresses/index.ts`** – Calls `addressForCheckout` to resolve shipping and billing address entries from the caller's address book.

## Notes

- Pre-flight resolvers (`resolvePaymentMethod`, `resolveShipping`, `resolveBilling`) are ordered so that any refusal fires **before** stock is held or an order document is written. The file's module doc explicitly flags the race risk.
- `resolvePaymentMethod` uses a parameter default (`paymentMethod = 'card'`) rather than `?? 'card'` so that a caller explicitly passing `undefined` still resolves to `card`; the comment warns against changing this.
- `StockRefusal.type === 'unavailable'` carries a `status` field (404 pre-flight, 409 post-`placeOrder`) and an optional `lines` array; both shapes are "existing behaviours, preserved as-is" per the comment—do not unify them.
- `toOrderAddress` deliberately omits the spread of the whole `AddressItem`; any new address field must be added here individually to avoid leaking book metadata into the order.
- The file is the sole import point that bridges cart → orders/inventory/payments/users/delivery in a single write path; all cross-module writes funnel through this file.
