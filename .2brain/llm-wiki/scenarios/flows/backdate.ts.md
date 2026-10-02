---
source: scenarios/flows/backdate.ts
sha256: 6cef1da8b74248eb5a18d7a75cdde3488b16978c9f0839498d3d2de124c31ea6
generated_at: 2026-10-01T12:21:05.083389+00:00
model: ollama:qwen3.8:27b
---

# scenarios/flows/backdate.ts

## Purpose

Backdates a flow-produced order and every document the application wrote on its behalf (payment, shipment, reservation, stock movement, audit rows) into the past, so the demo shop has realistic date spread for analytics, filtering, and dashboards. Without this, every order shares the container's boot timestamp.

## Key elements

- **`backdateHistory(ages: Record<string, number>)`** — the sole export. Waits for the audit trail to settle, then backdates every order (and its trail) by the specified number of days, concurrently across orders.
- **`backdateOrder(orderId, days)`** — runs all six collection movers for one order in parallel; short-circuits (resolves immediately) when `days <= 0`.
- **`settleAuditTrail()`** — polls `auditLogModel.countDocuments()` every 50 ms (up to 20 rounds) until two consecutive counts match, ensuring fire-and-forget audit events have landed before dates are rewritten.
- **`mover(model, find, dates)`** — a generic factory that closes over a single Mongoose model, a per-schema query filter, and a list of date columns, returning an `(orderId, days) => Promise` that issues one `updateMany`.
- **`shiftStage(dates, days)`** — builds the `$set` aggregation stage; each date field becomes `$ifNull: [$dateSubtract(...), '$$REMOVE']` so absent columns stay absent rather than being written as `null`.
- **`TRAILS`** — the six wired-up movers, one per collection.

## Relationships

- **`src/modules/orders/model.ts`** — `orderModel` is the primary target; filtered by `_id`.
- **`src/modules/payments/model.ts`** — `paymentModel` filtered by `orderId`; `receivedAt` is shifted alongside `createdAt`/`updatedAt`.
- **`src/modules/delivery/model.ts`** — `shipmentModel` filtered by `orderId`; `deliveredAt` is shifted.
- **`src/modules/inventory/model.ts`** — both `reservationModel` (filtered by `orderId`, `expiresAt` shifted) and `stockMovementModel` (filtered by `reference` string, only `createdAt`/`updatedAt` shifted).
- **`src/modules/audit-logs/model.ts`** — `auditLogModel` filtered by `target_id` string; only the `timestamp` column is shifted. Also polled by `settleAuditTrail`.
- **`scenarios/index.ts`** — imports and orchestrates `backdateHistory` as part of the scenario bootstrap.

## Notes

- **Mongoose 9 pipeline flag**: every update uses `updatePipeline: true`; omitting it makes Mongoose 9 reject the array update.
- **`timestamps: false` is required**: without it Mongoose stamps `updatedAt` with *now*, undoing the backdate on the very row being rewritten.
- **String vs ObjectId references**: `stockmovements.reference` and `auditlogs.target_id` store the order id as a plain string; the other four collections use a real `ObjectId` ref. The `find` callback in each `mover` call accounts for this.
- **`$$REMOVE` semantics**: a date column that is absent on a given row (e.g. `deletedAt` on a non-deleted order) is left absent, not set to `null`.
- **Concurrency model**: orders are processed in parallel (`Promise.all` over `ages`), but the six collection writes within a single order are independent `updateMany` calls that run concurrently. There is no transaction or serial dependency between them.
- **`settleAuditTrail` cap**: 20 rounds × 50 ms = 1 s maximum wait. On a healthy machine it settles in 1–2 rounds.
