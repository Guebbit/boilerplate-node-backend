---
source: src/modules/delivery/services/start.ts
sha256: 5461b0f39511197f82d6ee002071acc8d930059cc6de5ea26f205d6b942c32f2
generated_at: 2026-10-14T15:34:39.482476+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/services/start.ts

## Purpose

Handles two distinct, non-"act" concerns in the delivery module: starting fulfilment on a **paid** order (the `paid → processing` transition) and serving the shipping-methods catalogue for the checkout selector. It exists as a service layer that orchestrates the order-status change, ensures fulfillment orders exist, and records the audit event — without belonging to any individual fulfillment-order or shipment workflow.

## Key elements

- **`listMethods`** — Returns the full, unfiltered `SHIPPING_METHODS` array (from `../domain`) augmented with the live `shopCurrency()`, `shipToCountries()`, and `returnAddress()` values. Always a `ResponseSuccess`; eligibility checks happen later at the cart/checkout layer.
- **`startFulfilment`** — Given an `orderId`, loads the order, checks outranked refusals, verifies status is `paid`, calls `ensureFulfillmentOrders`, marks the order `processing`, records an audit entry, and returns the order with caller-specific actions. Returns typed rejections (404 / 409) on failure paths.
- **`notPaid`** (private) — Builds the `409` `ResponseReject` with the `ORDER_NOT_PAID` error code and i18n message.

## Relationships

- **`@infrastructure/http/response`** — `generateSuccess` / `generateReject` shape every return value; `ResponseSuccess` / `ResponseReject` are the return-type contracts.
- **`@infrastructure/i18n`** — `t()` localises the error messages (`delivery.not-paid`, `delivery.order-not-found`).
- **`@infrastructure/observability/audit`** — `recordAudit` writes the admin action entry on successful transition.
- **`@modules/orders`** (index / config) — `orderService` provides `getById`, `outrankedRefusalFor`, `markProcessing`, `withActions`; `shopCurrency`, `shipToCountries`, `returnAddress` supply live deployment config to `listMethods`.
- **`@modules/delivery/audit`** — `deliveryAuditActions.ADMIN_ORDER_FULFILMENT_STARTED` is the audit action constant.
- **`@modules/delivery/domain`** — `SHIPPING_METHODS` is the static catalogue spread into the response.
- **`@modules/delivery/services/ensure`** — `ensureFulfillmentOrders` is called before `markProcessing` to guarantee the fulfillment-order rows exist.
- **`@types`** — `OrderStatus`, `Order`, `AuthContext`, `CallerContext`, `ShippingMethodsResponse` form the type surface.

## Notes

- `currency` and `shipToCountries` are read **per call** (live `NODE_DEFAULT_CURRENCY` / `NODE_SHIP_TO_COUNTRIES`), not baked into the `SHIPPING_METHODS` constant at import time — a static array would freeze the import-time value.
- There is deliberately **no `forced` variant** of `startFulfilment`. The admin override (`orders.any.override`, `POST /orders/{id}/status-override`) is the only other path into `processing`; duplicating it here would create a second forcing shape.
- Both `authContext` (for response actions) and `context` (narrower, for audit) are passed separately rather than one being derived from the other.
- The `methods` array in `listMethods` uses `.map((m) => ({...m, currency}))` to work around the `readonly` modifier on `SHIPPING_METHODS` while satisfying the mutable `ShippingMethodsResponse` type.
