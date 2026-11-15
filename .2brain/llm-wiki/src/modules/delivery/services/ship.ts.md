---
source: src/modules/delivery/services/ship.ts
sha256: 530faf96145f4b53e0fd3f69fcf5c9b8aa962b803f022be28eb375ecb55aacc4
generated_at: 2026-11-14T19:50:43.653288+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/services/ship.ts

## Purpose

Implements the staff-facing "ship" action: cutting a shipment (some or all) from a fulfillment order. It orchestrates a single-transaction write (fulfillment lines, new shipment, stock decrement, order status) and then runs post-commit side effects (shelf-cache refresh, audit row, buyer notification). It is the public entry point that controllers call to record that goods left the shelf.

## Key elements

- **`ShipInput`** (exported interface) — the request body: optional `lines` (per-product quantities; absent = ship everything remaining) and optional `trackingCode`.
- **`Shipped`** (internal interface) — the tuple the transaction leaves for post-commit steps: `shipment`, `order`, `remainingUnits`.
- **`gateOrder`** (private) — validates order status. `canceled`/`pending` → 409 `DELIVERY_NOT_SHIPPABLE`; `paid` without `start` permission → 403; other non-processing → 409 `ORDER_NOT_PROCESSING`.
- **`gateFulfillmentOrder`** (private) — ensures the fulfillment order is `physical` and shippable, then validates requested lines against available stock via `checkShipLines`. Returns the resolved line list or throws a 422 refusal.
- **`shipAct`** (private) — the transactional core. Reads snapshot, runs both gates, calls `cutShipment`, performs the `paid → processing` transition (`startFulfillment`), reports progress, settles the order, and announces the shipment. Returns a `Shipped`.
- **`afterShipped`** (private) — post-commit: refreshes the shelf stock cache via `orderService.refreshShelf`, then records an audit row.
- **`shipFulfillmentOrder`** (exported function) — public API. Decides `mayStart` before opening the transaction (so retries are idempotent in verdict), runs the act via `runAct`, handles refusals (including `auditUnearnedStart`), and on success chains `afterShipped` → `generateSuccess(viewShipment(...), 201)`.

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/modules/delivery/services/act.ts` | Provides `runAct` (transaction runner), `readWithOrder` (snapshot read), `refuse` (structured refusal). |
| `src/modules/delivery/services/cut.ts` | `cutShipment` performs the actual line/stock/shipment mutation inside the session. |
| `src/modules/delivery/services/progress.ts` | `startFulfillment` (paid→processing), `reportProgress` (recomputes order progress), `settleOrder` (finalises order status when nothing remains). |
| `src/modules/delivery/services/announce.ts` | `announceShipped` queues the buyer-visible notification inside the transaction. |
| `src/modules/delivery/services/actions.ts` | `viewShipment` shapes the shipment + order documents into the response payload. |
| `src/modules/delivery/services/ship-gate.ts` | `mayStartFulfillment`, `isOpenForShipment`, `refuseUnearnedStart`, `auditUnearnedStart` — permission and status gating logic. |
| `src/modules/delivery/services/index.ts` | Barrel that re-exports `shipFulfillmentOrder` as the module's public API. |
| `src/modules/delivery/domain/index.ts` | Barrel re-exporting `checkShipLines`, `isShippable`, `ProductQuantity` from the domain layer. |
| `src/modules/delivery/domain/fulfillment.ts` | Implementation of `checkShipLines` (line validation) and `isShippable` (order-level shippability check). |
| `src/modules/delivery/model.ts` | `FulfillmentOrderDocument`, `ShipmentDocument` — Mongoose document types used throughout. |
| `src/modules/delivery/audit.ts` | `deliveryAuditActions.ADMIN_ORDER_SHIPPED` — the audit action constant. |
| `src/infrastructure/observability/audit.ts` | `recordAudit` — writes the audit row post-commit. |
| `src/infrastructure/http/response.ts` | `generateSuccess`, `ResponseSuccess`, `ResponseReject` — response envelope helpers. |
| `src/modules/orders/index.ts` | `orderService.refreshShelf` — invalidates/refreshes per-product stock cache. |
| `src/modules/orders/model.ts` | `OrderDocument` type used in the `Shipped` return. |

## Notes

- **`paid` orders ship from this endpoint.** The `paid → processing` transition is performed *inside* the transaction by `startFulfillment`; the caller therefore needs both `start:Shipment` and `update:Shipment` capabilities. `on_hold` orders are never shippable.
- **`mayStart` is resolved before the transaction opens.** A retried transaction must not produce a different gate verdict, so the permission check is deliberately hoisted out of `shipAct`.
- **Post-commit work is outside the transaction.** `afterShipped` (shelf refresh + audit) runs after `runAct` resolves. If it fails, the shipment is already durable.
- **`announceShipped` is called inside the transaction**, but per the module doc the actual buyer mail is driven by the `shipment.shipped` event, not by a synchronous send here.
- **Refusal on unearned start** (`auditUnearnedStart`) is recorded in the *refusal* path of `shipFulfillmentOrder`, not inside the act, so no transaction is opened for a permission denial.
