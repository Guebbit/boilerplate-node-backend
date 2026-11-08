---
source: src/modules/delivery/services/process.ts
sha256: 5040701908372dff0a02b8502404c44533eb0f81a92c0dd474ca1c899b4b71a3
generated_at: 2026-11-08T05:38:00.690689+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/services/process.ts

## Purpose

Provides two delivery-service operations that sit outside the fulfillment/shipment domain: starting the `paid → processing` transition on an order, and exposing the shipping-methods catalogue for the checkout selector. It exists to keep "what the caller can do to an order from `paid`" and "what methods are available" as a single, act-free service layer.

## Key elements

- **`listMethods()`** — Returns the full, unfiltered shipping-methods list with a live currency applied via `quoteMethod`. Always a success response; validation against the caller's basket happens elsewhere (cart PUT / checkout).
- **`processOrder(orderId, authContext, context)`** — The `paid → processing` door. Fetches the order, gates on `canProcessOrder`, calls `ensureFulfillmentOrders` (idempotent), then `orderService.markProcessing` with the caller's id on the timeline. Records an audit entry on success. Returns 404 if missing, 409 if not in a processable status.
- **`notPaid()`** *(internal)* — Builds the 409 rejection envelope used by `processOrder` when the order is not `paid`.

## Relationships

- **`@infrastructure/http/response`** — `generateSuccess` / `generateReject` shape every return value.
- **`@infrastructure/i18n`** — `t()` localises user-facing error messages (`delivery.not-paid`, `delivery.order-not-found`).
- **`@infrastructure/observability/audit`** — `recordAudit` writes the `ADMIN_ORDER_FULFILLMENT_STARTED` entry after a successful transition.
- **`../audit`** (`deliveryAuditActions`) — Provides the action constant used in the audit record.
- **`../domain`** — `SHIPPING_METHODS` (the static catalogue) and `quoteMethod` (applies the live currency to produce a per-method quote).
- **`./ensure`** — `ensureFulfillmentOrders` is called before marking processing; it creates the fulfillment-order rows if the `paid` lifecycle listener has not already done so.
- **`@modules/orders`** — `canProcessOrder` (lifecycle guard) and `orderService` (`getById`, `markProcessing`, `withActions`).
- **`@modules/shop`** — `shopCurrency()` supplies the live deployment currency to `listMethods`.
- **`@types`** — `AuthContext`, `CallerContext`, `Order`, `ShippingMethodsResponse` type the function signatures.
- **`services/index.ts`** — Barrel re-export for consumers of the delivery service.

## Notes

- **Currency is read per call, not at import time.** `listMethods` calls `shopCurrency()` inside the function body so that a change to `NODE_DEFAULT_CURRENCY` (or any config source) is reflected without a restart. Baking it into the `SHIPPING_METHODS` constant would freeze the value at module-load.
- **Fresh array each call.** `SHIPPING_METHODS` is `readonly`; `listMethods` maps it into a new mutable array to satisfy the `ShippingMethodsResponse` type.
- **Two context parameters, deliberately.** `authContext` (possibly `undefined`) drives the response's own `actions` field; `context: CallerContext` is the narrower, already-resolved shape needed for the audit entry. They are passed separately rather than one being derived from the other.
- **No `forced` / `override` variant here.** The admin status-override endpoint (`POST /orders/{id}/status-override`) is the only other path onto `processing`; adding a second forcing shape in `processOrder` would duplicate it.
- **Module doc comment** explicitly states this file is *not* about fulfillment orders or shipments, which is why it lives in `services/` rather than in an "act" folder.
