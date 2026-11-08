---
source: src/modules/delivery/services/ship.ts
sha256: eb33b2ea7169fa1aa7390a2befe6a6aedb6beffd25af582ba60032295ff1eba0
generated_at: 2026-11-08T05:40:01.266326+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/services/ship.ts

## Purpose

The "shipping door" for staff: cuts one or more shipments from a fulfillment order inside a single Mongoose transaction. Everything the shipment changes (fulfillment lines, the shipment document, stock units, order summary/status, `shipment.shipped`) commits atomically; the shelf-cache refresh and audit row follow after the commit. Also handles the automatic `paid → processing` transition when the caller holds `start:Shipment`.

## Key elements

- **`ShipInput`** (exported interface) — the request body: optional `lines` (which products/quantities ship; absent = all remaining) and optional `trackingCode`.
- **`shipFulfillmentOrder`** (exported) — the public entry point. Decides `mayStart` *before* opening the transaction (so retries cannot flip the verdict), runs `shipAct` via `runAct`, then either returns the refusal (after logging an unearned-start audit if applicable) or runs `afterShipped` and returns a `201` with `viewShipment(...)`.
- **`gateOrder`** (internal) — rejects `canceled`/`pending` orders with 409 `DELIVERY_NOT_SHIPPABLE`; delegates the `paid`-without-`start` refusal to `refuseUnearnedStart` (403); otherwise requires the order to be open for shipment.
- **`gateFulfillmentOrder`** (internal) — ensures the fulfillment order is `physical` and shippable, validates the requested lines against remaining lines via `checkShipLines`, and returns the resolved `ProductQuantity[]`.
- **`shipAct`** (internal) — the transactional core: reads the fulfillment order + order snapshot, runs both gates, calls `cutShipment`, `startFulfillment`, `reportProgress`, `settleOrder`, and `announceShipped`, then returns `{ shipment, order, remainingUnits }`.
- **`afterShipped`** (internal) — post-commit: refreshes the shelf stock cache via `orderService.refreshShelf` and writes the `ADMIN_ORDER_SHIPPED` audit row.

## Relationships

- **`./cut`** — `cutShipment` performs the actual shipment creation and stock decrement inside the transaction.
- **`./progress`** — `startFulfillment` (the `paid → processing` move), `reportProgress` (recomputes order summary), and `settleOrder` (applies status/summary) all run in-transaction.
- **`./announce`** — `announceShipped` writes the `shipment.shipped` event in-transaction.
- **`./act`** — `runAct` provides the transaction wrapper; `readWithOrder` reads the fulfillment order + parent order in the same session; `refuse` builds typed rejection objects.
- **`./ship-gate`** — `mayStartFulfillment` (pre-transaction capability check), `isOpenForShipment`, `refuseUnearnedStart`, and `auditUnearnedStart` handle authorization and the 403 path.
- **`./actions`** — `viewShipment` shapes the 201 response body.
- **`../domain`** — `isShippable` and `checkShipLines` validate fulfillment order state and line selections.
- **`../model`** — `FulfillmentOrderDocument` and `ShipmentDocument` types flow through the act.
- **`../audit`** — `deliveryAuditActions.ADMIN_ORDER_SHIPPED` constant for the audit entry.
- **`@modules/orders`** — `orderService.refreshShelf` (post-commit cache invalidation) and the `OrderDocument` type.
- **`@infrastructure/http/response`** — `generateSuccess` builds the 201 envelope; `ResponseReject` / `ResponseSuccess` shape return types.
- **`@infrastructure/observability/audit`** — `recordAudit` writes the post-commit audit row.

## Notes

- **Transaction boundary is strict.** All domain writes (shipment, lines, stock, order status, `shipped` event) happen inside the Mongoose session. The shelf refresh and audit row are deliberately *outside* the transaction — they are best-effort post-commit side effects.
- **`mayStartFulfillment` is decided before the transaction opens.** This is intentional: a retried transaction must not produce a different authorization verdict than the first attempt.
- **`cutShipment` is called with `forced: false, delivered: false, takeStock: true`.** This distinguishes a normal ship from an admin-forced or pre-delivered path (which other callers of `cutShipment` may use with different flags).
- **`lines` in `ShipInput` is optional.** Omitting it means "ship everything remaining on this fulfillment order." The resolved list is always a non-empty `ProductQuantity[]` by the time `cutShipment` runs.
- **The 409 vs 403 distinction matters.** `canceled`/`pending` → 409 (order is not in a shippable state at all). `paid` without `start:Shipment` → 403 (authorization gap, remediable by granting the capability).
