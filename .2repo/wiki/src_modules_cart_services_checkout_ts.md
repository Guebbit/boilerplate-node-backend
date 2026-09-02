# src/modules/cart/services/checkout.ts

## Purpose

Implements the checkout operation: resolves the caller's cart into a concrete order, reserves stock against it, and conditionally clears the cart. It is the only cart service that writes into another module's collection (orders) and the only one where a lost race can cost a customer money, so the concurrency model is explicit and documented inline.

## Key elements

- **`toStockLines(lines)`** — Maps `JoinedCartLine[]` to bare `{ productId, quantity }` pairs so the inventory module never sees cart-specific shape.
- **`toShippingAddress(address)`** — Picks only shipping-relevant fields from an `AddressItem` for embedding in the order; deliberately excludes `_id` and `default`.
- **`runCheckout(userId, addressId, shippingMethodId)`** (internal) — The full checkout pipeline: validates user → resolves shipping method → resolves address → reads cart lines → evaluates domain rules → creates the order → reserves stock → conditionally clears cart. Returns a `ResponseSuccess<OrderDocument>` or `ResponseReject`.
- **`orderConfirm(userId, context, addressId?, shippingMethodId?)`** (exported) — Public entry point. Wraps `runCheckout` with `rejectDatabaseEnvelope` for Mongoose cast/DB errors and emits the `CHECKOUT_COMPLETED` / `CHECKOUT_FAILED` analytics events.

## Relationships

- **`src/modules/cart/repository.ts`** — Reads the cart via `cartRepository.findByUserId` and performs the conditional clear via `cartRepository.clearLinesIfUnchanged` (version-gated write, not a transaction).
- **`src/modules/cart/domain/index.ts`** — Calls `evaluateCheckout(lines)` to get the domain verdict (empty / insufficient-stock / product-unavailable) before any writes.
- **`src/modules/account/index.ts`** — Calls `addressForCheckout(userId, addressId)` to resolve and ownership-check the shipping address.
- **`src/infrastructure/adapters/mailer.ts`** — Calls `enqueueEmail` to dispatch the order-confirmation email (locale comes from the user, not the request).
- **`src/infrastructure/http/response.ts`** — Constructs all success/reject responses via `generateSuccess` / `generateReject`.
- **`src/infrastructure/http/errors.ts`** — `orderConfirm`'s `.catch` funnels Mongoose `CastError` and unknown errors through `rejectDatabaseEnvelope`.
- **`src/infrastructure/http/request.ts`** — Accepts `CallerContext` for the analytics emission layer.
- **`src/infrastructure/i18n/index.ts`** — Uses `t()` for user-facing error messages and `getDefaultLocale()` as fallback for the confirmation email.
- **`src/infrastructure/observability/analytics/index.ts`** — Emits `CHECKOUT_COMPLETED` / `CHECKOUT_FAILED` events with `buildAnalyticsBase(context)`.
- **`src/modules/cart/analytics.ts`** — Supplies the `cartAnalyticsEvents` enum members used in the analytics payloads.

## Notes

- **No transaction.** Read cart → create order → clear cart are three separate writes. The cart clear is conditional on the `__v` captured at read time. A lost race retracts the order and returns 409 `CART_CHANGED`; it does *not* double-charge or leave the cart empty without an order.
- **Stock is reserved, not sold.** `inventoryService.reserveForOrder` holds units keyed by order ID; they remain available to other buyers until payment lands or the hold expires.
- **Error `code` vs `message`.** `code` (e.g. `CART_INSUFFICIENT_STOCK`) is stable, locale-independent, and consumed by the `CHECKOUT_FAILED` analytics property. `message` is translated and shown to the customer.
- **Order-before-reserve ordering is intentional.** A briefly-created-then-retracted order is recoverable; a cart emptied with no order is not.
- **All-digital + shipping method → 409.** If every line is `requiresShipping: false` but a shipping method was supplied, checkout is refused rather than silently dropping the charge.
- **`actorRole` is hardcoded to `'user'`** in the analytics payload, even when the caller is an admin, because a purchase is semantically a customer action.
