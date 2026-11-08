---
source: scenarios/flows/backdate.ts
sha256: 607d64ddccb39b89b2b191486d10a5d8be6920b39efb143614c18cf212e10da3
generated_at: 2026-11-08T02:29:00.985710+00:00
model: ollama:qwen3.8:27b
---

# scenarios/flows/backdate.ts

## Purpose

Backdates flow-produced orders (and every record the application wrote on the order's behalf) into the past so the demo shop has realistic date distributions. Without it, every order is stamped with the container boot time, making analytics charts flat and time-range filters meaningless. Runs after `shop-history` has created and dated the orders.

## Key elements

- **`mover`** – Factory that closes over a Mongoose model, a `find(orderId)` predicate, and a list of date fields, returning a function `(orderId, days) → Promise` that rewrites that collection's rows via `updateMany`.
- **`TRAILS`** – Array of eight `mover` instances covering `orders`, `orders.fulfillment.lastDeliveredAt` (guarded with `$exists`), `payments`, `fulfillmentOrders`, `shipments`, `reservations`, `stockMovements`, and `auditLogs`.
- **`shiftStage(dates, days)`** – Builds the `$set` aggregation stage; each field uses `$dateSubtract` wrapped in `$ifNull(…, '$$REMOVE')` so absent columns stay absent.
- **`backdateOrder(orderId, days)`** – No-ops when `days <= 0`; otherwise fires all `TRAILS` movers concurrently via `Promise.all`.
- **`settleAuditTrail()`** – Polls `auditLogModel.countDocuments()` up to 20 rounds (50 ms apart) until the count stabilises, ensuring fire-and-forget audit writes have landed before backdating.
- **`backdateHistory(ages)`** *(exported)* – Entry point. Awaits `settleAuditTrail`, then runs `backdateOrder` concurrently for every entry in the `ages` map (`Record<orderId, days>`).

## Relationships

| Neighbour | Interaction |
|---|---|
| `scenarios/flows/shop-history.ts` | Upstream caller; produces the orders and the `ages` map that `backdateHistory` consumes. |
| `src/modules/orders/model.ts` | Backdates `createdAt`, `updatedAt`, `deletedAt`, `withdrawUntil`, `conformityUntil`, and conditionally `fulfillment.lastDeliveredAt`. |
| `src/modules/payments/model.ts` | Backdates `createdAt`, `updatedAt`, `receivedAt` where `orderId` matches. |
| `src/modules/delivery/model.ts` | Backdates `fulfillmentOrder` (`agreedAt`, `expectedAt`, …) and `shipment` (`shippedAt`, `deliveredAt`, …) rows. |
| `src/modules/inventory/model.ts` | Backdates `reservation` (`expiresAt`, …) and `stockMovement` (`createdAt`, `updatedAt`) rows. Note: these two store the order id as a **string** in `reference` / `targetId`, not as an `ObjectId`. |
| `src/modules/audit-logs/model.ts` | Backdates `timestamp` via `targetId` (string match); `settleAuditTrail` polls `countDocuments()` on this model. |

## Notes

- **`timestamps: false`** on every `updateMany` call is load-bearing: Mongoose would otherwise re-stamp `updatedAt` to "now," undoing the backdate on the very rows being rewritten.
- **`updatePipeline: true`** is required by Mongoose 9 to accept an array update argument (aggregation-pipeline form); without it the call throws.
- The `fulfillment.lastDeliveredAt` mover filters with `{ 'fulfillment.lastDeliveredAt': { $exists: true } }` to avoid creating an empty `fulfillment` object on orders that have none (which would then fail on required sub-document fields at next save).
- `stockMovementModel` and `auditLogModel` key on **string** columns (`reference`, `targetId`), not `ObjectId` — the `find` predicate in `mover` is per-collection precisely to handle this.
- `settleAuditTrail` polls rather than sleeps: a fast machine settles in 1–2 rounds, a slow one may need more; the 20-round cap is a safety net.
- All writes are independent `updateMany` calls (no transaction); concurrency is `Promise.all` both across orders and across the eight trails within one order.
