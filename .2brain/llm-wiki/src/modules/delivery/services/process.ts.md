---
source: src/modules/delivery/services/process.ts
source_sha256: 1534bba58cfa1aefc1d4f9cdd82d21db18e4d71e26d26808627ba92dd4591c78
context_sha256: 09e8f25c7df2a09c2ddd4109bfb653fcc02fa83c625c903b5273e6f174cd4f99
generated_at: 2026-11-22T04:57:12.760360+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/delivery/services/process.ts

## Purpose
Handles two delivery operations that aren't tied to a fulfillment order or shipment: listing the shipping-methods catalogue for checkout, and starting fulfillment on a paid order (the `paid → processing` transition).

## Key elements
- **`listMethods()`**: Returns a `ResponseSuccess<ShippingMethodsResponse>` containing every method in `SHIPPING_METHODS`, each quoted via `quoteMethod(method, currency)`. It's unfiltered and always succeeds. Currency is read fresh per call from `shopCurrency()`.
- **`processOrder(orderId, authContext, context)`**: Loads the order and then:
  - Rejects with 404 (`delivery.order-not-found`) if the order is missing.
  - Rejects with 409 `ORDER_NOT_PAID` if `canProcessOrder(order.status)` is false.
  - Otherwise calls `ensureFulfillmentOrders`, then `orderService.markProcessing(orderId, undefined, context.caller.id)`.
  - Rejects with the same 409 if `markProcessing` returns nothing.
  - On success, records an audit entry and returns the order with `actions` attached via `orderService.withActions`.
- **`notPaid()`** (private): Builds the 409 rejection with `ERROR_CODES.ORDER_NOT_PAID` and the `delivery.not-paid` message.

## Relationships
- **`@modules/orders`** (`orderService`, `canProcessOrder`): Supplies order lookup, the `markProcessing` transition, `withActions`, and the status check.
- **`./ensure`** (`ensureFulfillmentOrders`): Creates the order's fulfillment orders before the status move.
- **`../domain`** (`SHIPPING_METHODS`, `quoteMethod`): Provides the catalogue and the per-currency quoting.
- **`@modules/shop`** (`shopCurrency`): Supplies the live currency.
- **`../audit`** (`deliveryAuditActions`) and **`@infrastructure/observability/audit`** (`recordAudit`): Record `ADMIN_ORDER_FULFILLMENT_STARTED` for the order.
- **`@infrastructure/http/response`**: Provides `generateSuccess`, `generateReject` and the response types.
- **`@infrastructure/i18n`** (`t`): Translates the error messages.
- **`@types`**: Provides `AuthContext`, `CallerContext`, `Order` and `ShippingMethodsResponse`.

## Notes
- `processOrder` takes both `authContext` and `context`. `authContext` shapes the response's `actions`, and `context` (a narrower, already-resolved shape) feeds the audit entry and the caller id on the timeline row.
- There is deliberately no `forced` variant. The admin override (`override:Order`, `POST /orders/{id}/override-status`) already covers forcing a move onto `processing`.
- Shipping straight from `paid` performs this transition itself, so `processOrder` is only the optional "mark in progress" step.
- `listMethods` doesn't check methods against the caller's basket. The cart's `PUT /cart/shipping-method` and checkout do that server-side.
- Currency is read at call time because `NODE_DEFAULT_CURRENCY` is live config. Baking it into `SHIPPING_METHODS` would freeze the import-time value.
- The audit entry is recorded only on success.
