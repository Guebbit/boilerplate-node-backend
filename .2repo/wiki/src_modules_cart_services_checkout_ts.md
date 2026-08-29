# src/modules/cart/services/checkout.ts

## Purpose

Implements the cart checkout operation: validates the basket, creates an order, reserves stock, conditionally empties the cart, and sends the confirmation email. It is the only cart service that writes to another module's collection and the only one where a concurrent race can double-charge a customer.

## Key elements

- **`orderConfirm(userId, context, addressId?, shippingMethodId?)`** — The sole export. Resolves shipping method and address (failing fast with 409/404 before any write), loads and validates cart lines via `evaluateCheckout`, creates the order, reserves inventory by order-id, conditionally clears the cart on the version read, and enqueues the confirmation email. Returns a `ResponseSuccess<OrderDocument>` or a structured `ResponseReject`.
- **`toStockLines(lines)`** — Maps `JoinedCartLine[]` to bare `{ productId, quantity }` pairs so the inventory module never sees cart-internal shape.
- **`toShippingAddress(address)`** — Picks only the shipment-relevant fields from an `AddressItem`, deliberately excluding `_id` and `default` so they cannot leak into the order snapshot. Omits `phone` when absent.

## Relationships

- **`src/modules/cart/repository.ts`** — Reads the cart (`findByUserId`) and performs the conditional clear (`clearLinesIfUnchanged(userId, version)`), which is the concurrency guard.
- **`src/modules/cart/domain/index.ts` / `rules.ts`** — `evaluateCheckout(lines)` supplies the pre-flight verdict (empty / insufficient-stock / product-unavailable); this file only maps that verdict to wire-level reject codes.
- **`src/modules/cart/analytics.ts`** — `cartAnalyticsEvents` provides the event shapes emitted via the analytics adapter on success and failure.
- **`src/modules/account/…`** — `addressForCheckout(userId, addressId?)` resolves and authorises the shipping address before any order is written.
- **`@modules/orders`** (not in graph but imported) — `orderRepository.create` / `.deleteOne`, `orderService`, `orderConfirmEmail`, `sumLineItems` are the order-lifecycle calls this function drives.
- **`@modules/inventory`** (not in graph but imported) — `inventoryService.reserveForOrder(orderId, stockLines)` holds units keyed to the order; on failure the order is deleted and a 409 returned.
- **`@modules/delivery`** (not in graph but imported) — `findShippingMethod` and `priceShipping` resolve the method and freeze the cost against the current basket total.
- **`@infrastructure/http/response.ts` / `errors.ts`** — All success/reject payloads are built through `generateSuccess`, `generateReject`, and `rejectDatabaseEnvelope`.
- **`@infrastructure/i18n/index.ts`** — `t()` and `getDefaultLocale` translate user-facing messages while error `code` strings stay stable and locale-independent.
- **`@infrastructure/adapters/mailer.ts`** — `enqueueEmail` dispatches the confirmation.
- **`@infrastructure/observability/analytics/index.ts`** — `emitAnalyticsEvent` / `buildAnalyticsBase` record the checkout outcome.

## Notes

- **Concurrency model (no transaction).** The cart is emptied via a conditional write (`clearLinesIfUnchanged`) keyed on the `__v` captured before the product join. If the write misses, the order that was already created is *deleted* and a 409 is returned. The order is written before the cart is cleared so a failed race retracts a recoverable document rather than silently discarding a basket.
- **409, not retry, for the loser.** The loser's cart is already empty and its lines live on the winner's order; re-running the request would just yield `CART_EMPTY`.
- **Stock is reserved, not sold.** `reserveForOrder` holds units against the order id; units are only removed from the world when payment completes or the hold expires.
- **Error codes are analytics contracts.** Codes like `CART_EMPTY`, `CART_INSUFFICIENT_STOCK`, `CART_PRODUCT_UNAVAILABLE` are emitted in the checkout-failure analytics event and must remain stable and locale-independent; only `message` is translated.
- **Shipping method and address are optional at checkout.** Passing `undefined` for either is valid (shipping/address not yet required to buy); passing a non-matching id is a 404 with a structured reject.
- **The `version` is captured before `readCartLines` joins products**, so any cart mutation during the join window invalidates the checkout rather than being silently skipped.
