---
source: src/modules/delivery/services/process.ts
sha256: 4054625542220ddaa43a44b07de9af3b80e4aaca7713c858d04b7a2bc9d87ce1
generated_at: 2026-10-29T03:42:09.925404+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/services/process.ts

## Purpose

Handles two delivery-service concerns that sit *before* any shipment exists: the static shipping-methods catalogue for checkout, and the `paid → processing` state transition that marks an order as being fulfilled. Neither operation creates a fulfillment order or shipment, so neither lives inside a delivery "act."

## Key elements

- **`listMethods()`** – Returns the full, unfiltered `SHIPPING_METHODS` array annotated with the current shop currency. Always a success; no filtering here (that happens server-side at `PUT /cart/shipping-method` and checkout).
- **`notPaid()`** *(private)* – Builds the standard `409` reject with `ORDER_NOT_PAID` and the i18n'd message, reused by `processOrder`.
- **`processOrder(orderId, authContext, context)`** – Validates the order exists and is in a processable state, ensures fulfillment orders exist (delegating to `ensureFulfillmentOrders`), marks the order `processing` on the orders side, records an audit entry, and returns the order with caller-specific `actions`.

## Relationships

- **`../domain`** – Imports `SHIPPING_METHODS` (the readonly catalogue) used by `listMethods`.
- **`./ensure`** – Calls `ensureFulfillmentOrders` as a prerequisite before `markProcessing`; this file does not create fulfillment orders itself.
- **`@modules/orders`** – Uses `canProcessOrder` for the status guard and `orderService` (`getById`, `markProcessing`, `withActions`) for the state transition and response shaping.
- **`@modules/shop`** – Calls `shopCurrency()` at request time to avoid freezing a deployment-time value.
- **`../audit`** – Supplies `deliveryAuditActions.ADMIN_ORDER_FULFILMENT_STARTED` for the audit record.
- **`@infrastructure/observability/audit`** – Emits the `recordAudit` call after a successful transition.
- **`@infrastructure/http/response`** – All return values are shaped through `generateSuccess` / `generateReject`.
- **`@infrastructure/i18n`** – Localised user-facing messages (`delivery.not-paid`, `delivery.order-not-found`).
- **`@modules/orders/domain/lifecycle`** – `canProcessOrder` (imported via `@modules/orders`) encapsulates which statuses permit the transition.

## Notes

- `listMethods` reads `shopCurrency()` **per call**, not at module load, because it reflects live deployment config (`NODE_DEFAULT_CURRENCY`). Baking it in would freeze the value at import time.
- `SHIPPING_METHODS` is `readonly`; the response type is mutable, so `listMethods` spreads each entry into a new object.
- `processOrder` accepts **two** caller shapes: `authContext` (full, for the response's `actions`) and `context: CallerContext` (narrower, for the audit row). Neither is derived from the other here.
- There is deliberately **no `forced`/override variant** in this file. The admin override path (`POST /orders/{id}/status-override`) is the other way to reach `processing`; duplicating a forcing shape here would create a second, parallel entry point.
- The timeline entry uses `context.caller.id` (the operator), not a system id, so the audit/timeline row names the human who triggered it.
