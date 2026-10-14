---
source: src/modules/delivery/services/ship.ts
sha256: 5ad260b12f008748746529f0f51d492577a5d21881d3520c0cae117ad6ec4b74
generated_at: 2026-10-14T15:33:27.483423+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/services/ship.ts

## Purpose

Implements the staff "shipping door": cutting a shipment out of a fulfillment order. All writes (fulfillment lines, the shipment record, unit stock, order summary/status, `shipment.shipped`) commit in a single transaction; the buyer notification and audit row are dispatched after commit.

## Key elements

- **`ShipInput`** (exported interface) — staff request shape: optional `lines`, `trackingCode`, `forced` flag, and `reason`.
- **`gateOrder`** — refuses if order is `cancelled`/`pending` (409, not shippable) or not in `processing` (or `paid` when forced).
- **`gateFulfillmentOrder`** — enforces physical kind, shippable state, and validates requested lines via `checkShipLines`; returns the resolved `ProductQuantity[]`.
- **`gateTracking`** — looks up the shipping method live and refuses (422) if it is tracked but no tracking code was supplied.
- **`shipAct`** — the transactional core: reads fulfillment order & order in-session, runs the three gates, calls `cutShipment`, marks order `processing` (forced-from-paid case), reports progress, settles the order, records forced fulfilment, and writes the shipped event.
- **`afterShipped`** — post-commit chain: refresh shelf stock cache → `notifyShipped` → `recordAudit`.
- **`shipFulfillmentOrder`** (exported) — the public entry point. Resolves the fulfillment order and order, checks `refuseUnearnedForce`, applies the outrank refusal (pre-transaction, no writes), then runs `runAct(shipAct)` and on success calls `afterShipped` → `viewShipment` → `generateSuccess(201)`.

## Relationships

- **`@infrastructure/http/response`** — builds the `201` success and `4xx` rejection responses returned to the caller.
- **`@infrastructure/i18n`** — localizes refusal messages via `t()`.
- **`@infrastructure/observability/audit`** — `recordAudit` writes the post-commit audit row.
- **`../domain` (index, fulfillment, rates)** — `checkShipLines`, `isShippable`, `findShippingMethod`, and the `ProductQuantity` type used for line validation and tracking-method lookup.
- **`../audit`** — supplies the `deliveryAuditActions.ADMIN_ORDER_SHIPPED` action identifier.
- **`../model`** — `FulfillmentOrderDocument` / `ShipmentDocument` types used in the act and post-commit steps.
- **`../repository`** — `fulfillmentOrderRepository.findInSession` / `findById` for reading the fulfillment order.
- **`./act`** — `runAct` wraps the transaction; `refuse` / `refuseMissing` short-circuit with a typed rejection.
- **`./actions`** — `viewShipment` shapes the shipment for the API response.
- **`./announce`** — `announceShipped` writes the shipped domain event inside the transaction.
- **`./cut`** — `cutShipment` performs the actual shipment creation and unit deduction.
- **`./force`** — `refuseUnearnedForce` gates the `forced` flag against the caller's override permission before any transaction opens.

## Notes

- `forced` only widens *which* order status may ship (`paid` instead of `processing`); it never changes what is written and never permits shipping from `on_hold`.
- The tracking-method requirement is evaluated against the **current** rate lookup, not the value frozen at checkout — a rate change can retroactively require a tracking code.
- The outrank refusal is checked *before* `runAct` opens a transaction, so it always writes nothing.
- `shipAct` reads the fulfillment order and order **within the session** (snapshot reads) to ensure gates evaluate the same data the writes commit against.
