---
source: scenarios/flows/backdate.ts
sha256: 607d64ddccb39b89b2b191486d10a5d8be6920b39efb143614c18cf212e10da3
generated_at: 2026-10-29T01:22:35.551449+00:00
model: ollama:qwen3.8:27b
---

# scenarios/flows/backdate.ts

## Purpose

Ages flow-produced orders (and every record they touched) into the past so the demo shop presents real date spread rather than a single boot-time stamp. Runs per-order to keep the order, its payment, shipment, reservation, stock movements, and audit rows mutually consistent about when events occurred.

## Key elements

- **`mover`** (internal factory) — Builds a per-collection backdating function. Closes over a specific Mongoose model, a `find` predicate (how that collection references the order), and a list of date fields. Returns an async `(orderId, days) => Promise<unknown>` that issues a single `updateMany` with an aggregation-pipeline `$set`.
- **`TRAILS`** (internal array) — Eight `mover` instances covering: `orders` (root dates + `fulfillment.lastDeliveredAt`), `payments`, `fulfillmentOrders`, `shipments`, `reservations`, `stockMovements`, and `auditLogs`.
- **`shiftStage`** (internal) — Produces the `$set` stage object. Each field becomes `{ $ifNull: [{$dateSubtract: …}, '$$REMOVE'] }` so absent fields stay absent.
- **`backdateOrder`** (internal) — No-ops when `days ≤ 0`; otherwise runs all eight TRAIL movers concurrently for one order.
- **`settleAuditTrail`** (internal) — Polls `auditLogModel.countDocuments()` every 50 ms (up to 20 rounds) until the count stabilises, ensuring in-flight fire-and-forget audit writes have landed before backdating begins.
- **`backdateHistory`** (export) — Public entry point. Takes `Record<string, number>` (orderId → days back), waits for the audit trail to settle, then backdates all orders concurrently (sequential within each order).

## Relationships

- **`scenarios/flows/shop-history.ts`** — Produces the `ages` map (orderId → days) consumed by `backdateHistory`. This file is the "ageing" half of the pair; shop-history decides *how old* each order should be.
- **`src/modules/orders/model.ts`** — Two trail entries: root order dates (`createdAt`, `updatedAt`, `deletedAt`, `withdrawUntil`, `conformityUntil`) and the nested `fulfillment.lastDeliveredAt` (guarded by `$exists: true`).
- **`src/modules/payments/model.ts`** — Backdates `createdAt`, `updatedAt`, `receivedAt` via `orderId` reference.
- **`src/modules/delivery/model.ts`** — Backdates `fulfillmentOrderModel` (`agreedAt`, `expectedAt`, …) and `shipmentModel` (`shippedAt`, `deliveredAt`, …) via `orderId` reference.
- **`src/modules/inventory/model.ts`** — Backdates `reservationModel` (`expiresAt`, …) via `orderId` and `stockMovementModel` via the string column `reference`.
- **`src/modules/audit-logs/model.ts`** — Backdates `timestamp` via the string column `targetId`; also the model polled by `settleAuditTrail`.

## Notes

- **Mongoose 9 `updatePipeline: true`** is mandatory — without it Mongoose rejects a bare-array `update` as a likely mistake.
- **`timestamps: false`** on every `updateMany` call prevents Mongoose from re-stamping `updatedAt` to "now," which would undo the backdating on that very field.
- **`$ifNull` → `$$REMOVE`** keeps optional fields (e.g. `deletedAt` on a non-deleted order) absent rather than writing `null`.
- **The `fulfillment.lastDeliveredAt` trail** adds an explicit `'fulfillment.lastDeliveredAt': { $exists: true }` filter; without it the pipeline would create an empty `fulfillment` object on orders that have none, triggering a schema validation failure on next save.
- **String vs ObjectId references** — `stockMovements` and `auditLogs` store the order id as a string (`reference`, `targetId`); the other four models use an `ObjectId` field. The `find` predicate in each `mover` call encodes this difference.
- **`settleAuditTrail`** is not a fixed sleep — it compares consecutive counts, so a fast machine exits after one round while a slow one waits longer (capped at 20 × 50 ms = 1 s).
