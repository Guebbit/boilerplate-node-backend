---
source: src/modules/delivery/services/progress.ts
sha256: 1caf0cbfe5cc527c712df2c777fff5ddbd26d51c2a434be05befcc210fd45a95
generated_at: 2026-10-14T15:32:06.658963+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/services/progress.ts

## Purpose

Keeps the `orders` module in step with delivery's writes, inside an act's transaction. It recomputes the fulfillment summary from the delivery records themselves (never adjusts it) and asks `orders` to move the order's status exactly when the summary indicates all goods have left or all have arrived. If `orders` refuses (e.g., the order was cancelled in the meantime), this file aborts the act.

## Key elements

- **`ProgressReport`** (interface) — the bundle of data `reportProgress` reads and writes back: the updated order, the computed summary, the fulfillment orders, and the shipments.
- **`reportProgress(orderId, session)`** — sequential read of fulfillment orders and shipments under the act's transaction, computes a summary via `summarize`, hands it to `orderService.recordFulfillmentProgress`, and returns a `ProgressReport`. Refuses the act (409 `DELIVERY_NOT_SHIPPABLE`) if the order can no longer be fulfilled.
- **`expectMoved(moved)`** — internal guard; calls `refuse(409, ORDER_NOT_PROCESSING)` if the status write returned `null`, aborting the act.
- **`settleOrder(orderId, status, summary, at, session, actor?)`** — moves the order's status only when the summary warrants it: `processing → shipped` (units left, none out), `shipped → delivered` (all arrived), or a **double move** `processing → delivered` in one call (digital fulfilment, or remainder cancelled after every shipment already arrived). No-op when units remain or nothing has shipped.

## Relationships

- **`src/modules/orders/index.ts`** — calls `orderService.recordFulfillmentProgress`, `orderService.markShipped`, and `orderService.markFulfilmentComplete`. This file never writes order status directly; it delegates entirely to the orders module.
- **`src/modules/orders/model.ts`** — uses the `OrderDocument` type for return values and status checks.
- **`src/modules/delivery/domain/index.ts`** — imports `summarize` and the `FulfillmentReport` type to compute the summary from raw records.
- **`src/modules/delivery/repository.ts`** — imports `fulfillmentOrderRepository` and `shipmentRepository` to read the act's snapshot.
- **`src/modules/delivery/model.ts`** — imports `FulfillmentOrderDocument` and `ShipmentDocument` types.
- **`src/modules/delivery/services/act.ts`** — imports `refuse` to abort the act on any failure path.

## Notes

- Reads are deliberately **sequential** (`.then` chain), not parallel, because a Mongoose `ClientSession` does not support concurrent operations within a single transaction.
- `orders` remains the sole status writer; this file only *asks* it to move and *refuses* the act when it cannot. The 409 codes (`DELIVERY_NOT_SHIPPABLE`, `ORDER_NOT_PROCESSING`) are the two distinct "no" answers.
- The `at` parameter on `settleOrder` stamps the completion instant (last arrival or cancel time) for the order timeline — it is not a "now" call.
- `actor` is optional: present for staff-initiated acts (timeline attribution), absent for system-driven flows.
