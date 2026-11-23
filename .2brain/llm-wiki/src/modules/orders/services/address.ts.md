---
source: src/modules/orders/services/address.ts
source_sha256: 746f2beb59ea9d2570acec8d0763aea73596a4761074f763806c7b5336825d1f
context_sha256: a313676f02b5ceefd0a5e79d0e6839e97ff441c8ec815094c66a1233911c3461
generated_at: 2026-11-22T06:18:25.013728+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/orders/services/address.ts

## Purpose
Implements the staff action "correct an order's shipping address" (`PUT /orders/{id}/shipping-address`). It is the only way to change an address after checkout, for example to release a held `incorrect_address` fulfillment order. It replaces the address only for units not yet shipped; each shipment keeps its own copy. The address stays encrypted under the order's id. The audit row and timeline entry record who made the change, never what the address says.

## Key elements
- `correctShippingAddress(orderId, address, context)`: the sole public export. Returns `Promise<ResponseSuccess<OrderDocument> | ResponseReject>`.
  1. Loads the order with `orderRepository.findByIdScoped`. Returns 404 if it is missing.
  2. Returns 409 (`ORDER_ADDRESS_LOCKED`) if `canCorrectAddress(order)` is false.
  3. Returns 422 (`ORDER_SHIP_TO_COUNTRY_NOT_SUPPORTED`) if `address.country` is not in `shipToCountries()`.
  4. Inside `withTransaction`, calls `orderRepository.replaceShippingAddress(orderId, order.status, address, session)` wrapped by `withTimeline`. The timeline event is `{ type: 'address_corrected', actor: context.caller.id }`.
  5. Returns 409 if the replace returns nothing, meaning a dispatch or status change won the race.
  6. Otherwise calls `recordAudit` with `ADMIN_ORDER_ADDRESS_CORRECTED` (outcome `success`, target type `order`) and returns the updated order via `generateSuccess`.
- `locked()` (private): builds the 409 `ORDER_ADDRESS_LOCKED` rejection with the message `orders.address.locked`.

## Relationships
- `infrastructure/http/response`: `generateSuccess` and `generateReject` build the return values.
- `infrastructure/i18n`: `t` supplies the localized error messages.
- `infrastructure/observability/audit` and `../audit`: `recordAudit` is called with the `ordersAuditActions` constant.
- `infrastructure/runtime/database`: `withTransaction` supplies the session for the write.
- `../domain`: `canCorrectAddress` decides whether the order is still correctable.
- `../repository`: `findByIdScoped` and `replaceShippingAddress`.
- `../model`: provides the `OrderDocument` type.
- `./timeline`: `withTimeline` appends the `address_corrected` timeline row in the same transaction as the write.
- `@modules/shop`: `shipToCountries` is the list of allowed destination countries.
- `@types` and `@api/error-codes`: the `CallerContext` and `OrderAddress` types, and the error codes.

## Notes
- The ship-to-country check mirrors checkout. Redirecting abroad would break the VAT the order was charged.
- The status is passed to `replaceShippingAddress` and the result is checked for a miss. This guards against a race with dispatch or a status move after the initial read.
- The caller (the route) is expected to have already enforced the `update:Order` permission. This service does not check it.
- A pickup or digital order has no shipping address and also gets the 409.
- Buyer self-service editing is not implemented here; the header calls it a later, optional step.
