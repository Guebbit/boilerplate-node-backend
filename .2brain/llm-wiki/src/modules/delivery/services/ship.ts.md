---
source: src/modules/delivery/services/ship.ts
sha256: 770b912cdaecf24681dbc3827b5135875a4e9b0c125da4460df6c6456fd853ce
generated_at: 2026-10-29T03:44:06.193397+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/services/ship.ts

## Purpose

Implements the staff "ship" action: cutting a shipment from a fulfillment order. All domain mutations (shipment creation, stock units leaving the shelf, order summary/status update, `shipment.shipped` event) commit in a single Mongoose transaction. Post-commit side effects (stock-cache refresh, audit row) run outside that transaction.

## Key elements

- **`ShipInput`** (exported) — caller payload: optional `lines` (per-product quantities) and optional `trackingCode`.
- **`Shipped`** (internal) — snapshot the transaction hands to post-commit steps: the shipment doc, order doc, and remaining unit count.
- **`gateOrder`** — rejects if the order is `cancelled`/`pending` (409) or `paid` without `start:Shipment` permission (403).
- **`gateFulfillmentOrder`** — rejects non-physical or non-shippable fulfillment orders; validates requested lines via `checkShipLines`.
- **`shipAct`** — the transactional body: snapshot read → gates → `cutShipment` → `startFulfilment` (if first shipment from `paid`) → `reportProgress` → `settleOrder` → `announceShipped`.
- **`afterShipped`** — post-commit: refreshes the shelf stock cache, then writes the audit row.
- **`shipFulfillmentOrder`** (exported) — public entry point. Decides `mayStart` before opening the transaction, runs `shipAct` via `runAct`, handles refusal (including `auditUnearnedStart`), and returns a `201` with the shipment view.

## Relationships

| Neighbor | Interaction |
|---|---|
| `services/ship-gate.ts` | Provides `mayStartFulfilment`, `isOpenForShipment`, `refuseUnearnedStart`, `auditUnearnedStart` — permission/gate logic. |
| `services/act.ts` | Provides `runAct` (transaction wrapper), `readWithOrder` (snapshot read), `refuse` (reject helper). |
| `services/cut.ts` | `cutShipment` creates the shipment document and moves stock units within the session. |
| `services/progress.ts` | `startFulfilment` (paid→processing), `reportProgress`, `settleOrder` — order-level bookkeeping. |
| `services/announce.ts` | `announceShipped` writes the `shipment.shipped` domain event inside the transaction. |
| `services/actions.ts` | `viewShipment` shapes the API response payload. |
| `domain/` (via `domain/index.ts`) | `isShippable`, `checkShipLines` — domain validation rules. |
| `model.ts` | `FulfillmentOrderDocument`, `ShipmentDocument` type imports. |
| `audit.ts` (module) | `deliveryAuditActions` enum for the audit action code. |
| `orders/index.ts` | `orderService.refreshShelf` — post-commit stock-cache invalidation. |
| `orders/model.ts` | `OrderDocument` type. |
| `infrastructure/http/response.ts` | `generateSuccess`, `ResponseSuccess`/`ResponseReject` for the HTTP envelope. |
| `infrastructure/observability/audit.ts` | `recordAudit` — writes the audit row post-commit. |
| `services/index.ts` | Re-exports `shipFulfillmentOrder` to the module's public surface. |

## Notes

- `mayStartFulfilment` is evaluated **before** the transaction opens so a retried transaction cannot change the permission verdict.
- The `paid → processing` transition is performed **inside** the same transaction by `startFulfilment`; the caller therefore needs both `start:Shipment` and `update:Shipment`.
- The buyer's email is **not** sent by this file. It is triggered downstream by the `shipment.shipped` event that `announceShipped` writes.
- Post-commit steps (`refreshShelf`, `recordAudit`) are intentionally non-transactional; if they fail, the shipment is already persisted.
