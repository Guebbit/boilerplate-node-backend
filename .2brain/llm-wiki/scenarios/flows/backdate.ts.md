---
source: scenarios/flows/backdate.ts
sha256: 9d96ab865f9f2377ff63ee7acbb9256ed78c06137c569d8d4fe3060f2dda7369
generated_at: 2026-09-23T17:17:39.052999+00:00
model: ollama:qwen3.8:27b
---

# scenarios/flows/backdate.ts

## Purpose

Backdates every order produced by the boot-time demo flows (and all records the application wrote in response) so the shop has realistic date spread for analytics charts, "last 30 days" filters, and period-sensitive dashboards. Operates strictly per order—never a blanket shift—so the order, its payment, shipment, reservation, stock movements, and audit rows remain mutually consistent about _when_ events occurred.

## Key elements

- **`mover`** – Factory that closes over a Mongoose model, a `find` predicate, and a list of date columns, returning a `(orderId, days) => Promise` that runs an aggregation-pipeline `updateMany` to shift those columns.
- **`TRAILS`** – Array of six `mover` instances, one per collection: orders, payments, shipments, reservations, stock movements, audit logs.
- **`shiftStage`** – Builds the `$set` stage: each named field gets `$ifNull: [$dateSubtract(...), '$$REMOVE']`, so absent fields (e.g. `deletedAt` on a live order) stay absent rather than being written as `null`.
- **`backdateOrder(orderId, days)`** – Applies all six trail movers for one order concurrently; short-circuits to a resolved promise when `days <= 0`.
- **`settleAuditTrail()`** – Polls `auditLogModel.countDocuments()` at 50 ms intervals until two consecutive reads match (max 20 rounds), waiting for fire-and-forget audit writes to land before backdating.
- **`backdateHistory(ages)`** _(exported)_ – Public entry point: awaits `settleAuditTrail`, then runs `backdateOrder` for every order in the `Record<string, number>` map concurrently.

## Relationships

- **`src/modules/orders/model.ts`** – `orderModel` is the primary target; matched by `_id`.
- **`src/modules/payments/model.ts`** – `paymentModel` matched by `orderId`; shifts `createdAt`, `updatedAt`, `receivedAt`.
- **`src/modules/delivery/model.ts`** – `shipmentModel` matched by `orderId`; shifts `createdAt`, `updatedAt`, `deliveredAt`.
- **`src/modules/inventory/model.ts`** – `reservationModel` (matched by `orderId`) and `stockMovementModel` (matched by string `reference`) both shift their date columns.
- **`src/modules/audit-logs/model.ts`** – `auditLogModel` matched by string `target_id`; shifts `timestamp`. Also polled in `settleAuditTrail`.
- **`scenarios/index.ts`** – Upstream orchestrator that invokes `backdateHistory` as part of the boot sequence (the file references its sibling `shop-history.ts` as the step that originally assigns dates).

## Notes

- **`timestamps: false` is load-bearing.** Mongoose stamps `updatedAt` with the current time on every update by default; without this flag the write would undo the very shift it is performing.
- **`updatePipeline: true`** is required in Mongoose 9 to pass an array as an update operator; a bare array is otherwise rejected as a likely mistake.
- **`updatedAt` is deliberately shifted** alongside `createdAt`—a row "last touched now" describing a March event is the incoherence this pass eliminates.
- **`reservations.expiresAt` shifts too.** Backdated holds are already committed or released; leaving the expiry at boot time would be the only disagreeing date in the row.
- **String vs ObjectId matching:** `stockmovements.reference` and `auditlogs.target_id` store the order id as a plain string, unlike the four collections that use a real `ObjectId` reference. The per-collection `find` closure exists to keep each predicate type-correct.
- **`$$REMOVE`** in `shiftStage` ensures optional columns (`deletedAt`) are not materialised as `null` on rows that never had them.
- **`settleAuditTrail` uses adaptive polling** (two equal counts 50 ms apart) rather than a fixed sleep, so fast machines skip the wait entirely and slow machines get up to 1 s of grace.
