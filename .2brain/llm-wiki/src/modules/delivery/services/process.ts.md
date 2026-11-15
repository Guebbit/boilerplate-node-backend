---
source: src/modules/delivery/services/process.ts
sha256: 1534bba58cfa1aefc1d4f9cdd82d21db18e4d71e26d26808627ba92dd4591c78
generated_at: 2026-11-14T19:48:25.378746+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/services/process.ts

## Purpose

Service layer that (1) exposes the full shipping-methods catalogue for the checkout selector and (2) moves a paid order into `processing` (the `paid → processing` door). Neither operation concerns a fulfillment order or a shipment, which is why it lives here rather than in a fulfillment "act."

## Key elements

- **`listMethods()`** – Returns the complete `SHIPPING_METHODS` list with each method quoted against the caller's live shop currency. Always a success; no per-basket filtering (that happens in `PUT /cart/shipping-method` and checkout).
- **`processOrder(orderId, authContext, context)`** – Fetches the order, verifies it is `paid`, ensures fulfillment orders exist, marks the order `processing`, records an audit entry, and returns the order decorated with the caller's available actions. Returns 404 or 409 (`ORDER_NOT_PAID`) on failure.
- **`notPaid()`** *(internal)* – Builds the canonical 409 rejection payload used when the order is not in `paid` status.

## Relationships

- **`src/modules/orders/index.ts`**, **`src/modules/orders/services/index.ts`**, **`src/modules/orders/domain/lifecycle.ts`**: calls `orderService.getById`, `orderService.markProcessing`, `orderService.withActions`, and the `canProcessOrder` guard.
- **`src/modules/delivery/services/ensure.ts`**: calls `ensureFulfillmentOrders(orderId)` before the status move, so the `paid` listener has had a chance to create fulfillment orders.
- **`src/modules/delivery/domain/index.ts`**, **`src/modules/delivery/domain/rates.ts`**: reads `SHIPPING_METHODS` and `quoteMethod` to build the catalogue response.
- **`src/modules/shop/index.ts`**, **`src/modules/shop/service.ts`**: reads `shopCurrency()` at call time (not import time) to get the live deployment currency.
- **`src/infrastructure/http/response.ts`**: uses `generateSuccess` / `generateReject` and the `ResponseSuccess` / `ResponseReject` types for all return values.
- **`src/infrastructure/i18n/index.ts`**, **`src/infrastructure/i18n/context.ts`**: calls `t()` for user-facing error messages.
- **`src/infrastructure/observability/audit.ts`**: calls `recordAudit` after a successful `processing` transition.
- **`src/modules/delivery/audit.ts`**: imports `deliveryAuditActions` for the audit-action constant.
- **`src/types/auth-context.ts`**: consumes `AuthContext` and `CallerContext` parameter types.

## Notes

- `currency` is resolved **per call** via `shopCurrency()` rather than being frozen into `SHIPPING_METHODS` at module load — it reflects live deployment config (`NODE_DEFAULT_CURRENCY`).
- `processOrder` accepts **two** caller shapes: `authContext` (wider, for response `actions`) and `context` (narrower, for the audit entry). Neither is derived from the other at call time.
- There is intentionally **no `forced` variant** here; the admin status-override endpoint (`POST /orders/{id}/override-status`) is the sole other path onto `processing`.
- `SHIPPING_METHODS` is `readonly`; `listMethods` maps it to fresh mutable rows to satisfy the non-readonly response type.
