---
source: src/modules/cart/services/checkout.ts
sha256: 4491abbeda6442ecd27bfb8c9fdf3bd23366e3ab267c5e0fb56199abbe2d68b8
generated_at: 2026-09-23T18:32:11.502589+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/services/checkout.ts

## Purpose

The single cart operation that writes into the orders module's collection. It performs all pre-flight validation (payment method, address, shipping, stock, domain rules), delegates the actual order write to `placeOrder`, handles lost-race cleanup (retracting a briefly-created order on concurrent checkout), and emits analytics. It is the only cart service where a race can cost a customer money, so it carries explicit concurrency semantics.

## Key elements

- **`runCheckout`** (private) — The async checkout pipeline. Validates user → payment method → bank-transfer cap → shipping method → address → cart version → joined lines → domain rules → shipping applicability/weight → calls `placeOrder` → conditionally clears the cart via `cartRepository.clearLinesIfUnchanged(version)`. On a lost race, retracts the order and returns 409. Returns `ResponseSuccess<OrderDocument>` or `ResponseReject`.
- **`orderConfirm`** (referenced in docblock, defined below the truncated region) — The exported wrapper around `runCheckout` that attaches the `.catch` envelope (`rejectDatabaseEnvelope`) and fires the success/failure analytics events.
- **`toShippingAddress`** — Projects an `AddressItem` down to only the shipping fields (`fullName`, `street`, `city`, `zip`, `country`, optional `phone`) so the address book's `_id`/`default` metadata never leaks into the order document.
- **`holdMinutes` / `payBy`** — Converts `methodInfo.holdHours` to the minute-unit and deadline-Date that `placeOrder` expects; `card` passes `undefined` and inherits the orders module's default TTL.

## Relationships

- **`@infrastructure/http/response`** — `generateSuccess` / `generateReject` shape every return value; `ResponseSuccess` and `ResponseReject` are the file's output types.
- **`@infrastructure/http/errors`** — `rejectDatabaseEnvelope` is used in `orderConfirm`'s `.catch` to convert an unhandled database error into the standard 500 envelope.
- **`@infrastructure/i18n`** (`index`, `context`, `catalog`) — `t()` localises every user-facing `message`; `getDefaultLocale()` supplies the buyer's locale fallback for the order and email.
- **`@infrastructure/observability/analytics`** — `emitAnalyticsEvent` + `buildAnalyticsBase` fire on success and failure.
- **`@infrastructure/persistence/create-repository`** — `Lean<T>` type used to cast Mongoose hydrated docs to their plain shape.
- **`@modules/addresses`** (`index`, `model`, `service`) — `addressForCheckout` resolves and ownership-checks the shipping address; `AddressItem` is the input type to `toShippingAddress`.
- **`@modules/cart/analytics`** — `cartAnalyticsEvents` provides the stable event identifiers.
- **`@modules/cart/domain`** (`index`, `rules`) — `evaluateCheckout` runs the pure cart-rule verdict (empty / insufficient-stock / product-unavailable); `basketWeight` computes the joined weight for the shipping-method check.
- **`@modules/cart/repository`** — `cartRepository.findByUserId` reads the cart (capturing `__v`); `cartRepository.clearLinesIfUnchanged(version)` is the conditional write that makes exactly one of two racing checkouts win.
- **`@modules/cart/services`** (`index`) — Barrel export that surfaces `orderConfirm` to the rest of the app.

## Notes

- **Concurrency contract:** Read cart → write order → clear cart is three separate statements. Safety depends on `clearLinesIfUnchanged` being a conditional write keyed to the `__v` captured before the product join. If you refactor the ordering, the loser's `retractOrder` + 409 path is what prevents double-charge.
- **Pre-flight ordering matters:** Every validation that can reject (payment, address, shipping, stock) runs _before_ `placeOrder` is called, so no stock is held and no invoice number is minted on a bad request.
- **`code` vs `message`:** Reject codes (`CART_EMPTY`, `CART_INSUFFICIENT_STOCK`, etc.) are stable, locale-independent identifiers consumed by analytics; `message` is the translated string shown to the user. Do not rename codes.
- **`toObject() as Lean<ProductDocument>`:** The cast exists because Mongoose's untyped `DocType` generic makes `toObject()` resolve to `any`. It is a known friction point, not an oversight.
- **Shipping is optional:** `shippingMethodId === undefined` is a valid path (digital-only purchase). A named method on an all-digital basket is rejected, not silently ignored.
- **Bank-transfer cap** is checked here (checkout) rather than in the orders module, so the cap is enforced before any stock is reserved.
