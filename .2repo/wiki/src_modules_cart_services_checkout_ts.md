# src/modules/cart/services/checkout.ts

## Purpose

Implements the cart→order transition: validates the basket, resolves shipping and address, creates an order, reserves stock, conditionally clears the cart, sends the confirmation email, and emits analytics. It is the only cart operation that writes into another module's collection and the sole path where a race can double-charge a customer.

## Key elements

- **`toStockLines(lines)`** – Maps joined cart lines to the minimal `{ productId, quantity }` shape `inventory` expects, keeping `inventory` ignorant of the cart concept.
- **`toShippingAddress(address)`** – Picks only the delivery-relevant fields off an `AddressItem` so the account entry's `_id`/`default` never leak into the order document.
- **`runCheckout(userId, addressId?, shippingMethodId?)`** (internal) – The full sequential checkout: validate → resolve shipping method → resolve address → read cart & capture `__v` → join lines → `evaluateCheckout` → create order → `inventoryService.reserveForOrder` → `cartRepository.clearLinesIfUnchanged` → send email or retract. Returns a `ResponseSuccess<OrderDocument>` or `ResponseReject`.
- **`orderConfirm(userId, context, addressId?, shippingMethodId?)`** (exported) – Thin wrapper around `runCheckout` that adds the `rejectDatabaseEnvelope` catch and the analytics side-effects (`CHECKOUT_COMPLETED` / `CHECKOUT_FAILED`) plus `orderService.recordCreated`. This is the function controllers call.

## Relationships

- **`@infrastructure/i18n` (index.ts)** – `t()` for user-facing messages; `getDefaultLocale()` as fallback when the user has no stored locale for the confirmation email.
- **`@infrastructure/adapters/mailer.ts`** – `enqueueEmail` dispatches the order-confirmation template after the cart is successfully cleared.
- **`@infrastructure/http/response.ts`** – `generateSuccess` / `generateReject` build every return value.
- **`@infrastructure/http/errors.ts`** – `rejectDatabaseEnvelope` converts unexpected `CastError`/`Error` into the standard 500 envelope.
- **`@infrastructure/http/request.ts`** – `CallerContext` type threaded into `orderConfirm` for analytics base fields.
- **`@infrastructure/observability/analytics/index.ts`** – `emitAnalyticsEvent` + `buildAnalyticsBase` fire `CHECKOUT_COMPLETED` / `CHECKOUT_FAILED`.
- **`@modules/account` (index.ts / model.ts / services/addresses.ts)** – `addressForCheckout` resolves the shipping address with ownership check; `AddressItem` type used by `toShippingAddress`.
- **`@modules/cart/domain` (index.ts / rules.ts)** – `evaluateCheckout` supplies the domain verdict (empty / insufficient-stock / product-unavailable) and the shortfall details.
- **`@modules/cart/analytics.ts`** – `cartAnalyticsEvents` enum provides the stable event names.
- **`@modules/cart/repository.ts`** – `cartRepository.findByUserId` reads the cart; `cartRepository.clearLinesIfUnchanged` performs the conditional (version-gated) clear that makes the race safe.

## Notes

- **Concurrency contract.** The clear is *conditional on the `__v` captured at read time*, not a multi-document transaction. If two checkouts race, exactly one wins the conditional write; the loser retracts its own (already-created) order and returns `409 CART_CHANGED`. The order is always written **before** the cart is cleared so the loser can undo its side-effects.
- **Stock is reserved, not sold.** `inventoryService.reserveForOrder` holds units against the order id; they are not decremented from world stock until payment lands. A failed reserve rolls back its own lines internally, so only the order needs retracting.
- **Error codes are stable English identifiers** (`CART_EMPTY`, `CART_INSUFFICIENT_STOCK`, `CART_CHANGED`, etc.) because the `CHECKOUT_FAILED` analytics event reports `errors[0].code` as its `reason` property. The human-readable `message` is translated; the `code` is not.
- **Email locale.** The confirmation email uses `user.locale` (falling back to the system default), not the request's `Accept-Language`.
- **`actorRole` is hardcoded to `'user'`** in `orderService.recordCreated` regardless of who is in `context`, because a purchase is always a customer action.
- **`orderConfirm` is the only export.** Controllers and tests should import `orderConfirm`, not `runCheckout`; the analytics and error-envelope wrapping lives in the wrapper.
