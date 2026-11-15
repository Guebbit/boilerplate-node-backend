---
source: scenarios/flows/backdate.ts
sha256: 9c10827a27eec8d7864c37ec82340ac264014a92db38f83a022baf49c7462c58
generated_at: 2026-11-14T17:15:28.114667+00:00
model: ollama:qwen3.8:27b
---

# scenarios/flows/backdate.ts

## Purpose

Rewrites the timestamps on a flow-produced order and every document it touched so the demo shop appears to have multi-month history instead of all data dated to container boot. Without this, analytics charts, "last 30 days" filters, and dashboards would show identical results regardless of the requested period.

## Key elements

- **`mover(model, find, dates)`** — Factory that returns a per-collection updater. Each closure keeps its own `Model<T>` and `QueryFilter<T>` typed, avoiding `any` across six heterogeneous document types.
- **`TRAILS`** — Array of eight bound movers covering: orders (two entries — one for base fields, one conditional on a nested fulfillment field existing), payments, fulfillment orders, shipments, reservations, stock movements, and audit logs.
- **`shiftStage(dates, days)`** — Builds the `$set` aggregation stage. Uses `$dateSubtract` wrapped in `$ifNull` → `$$REMOVE` so absent columns stay absent rather than being written as `null`.
- **`backdateOrder(orderId, days)`** — Runs all eight trail movers for one order concurrently. No-ops if `days <= 0`.
- **`settleAuditTrail()`** — Polls `auditLogModel.countDocuments()` until two consecutive reads (50 ms apart) return the same count, ensuring in-flight fire-and-forget audit writes have landed before the date shift begins. Capped at 20 rounds.
- **`backdateHistory(ages)`** *(exported)* — Top-level entry point. Awaits audit settlement, then runs `backdateOrder` for every order in the `ages` map concurrently.

## Relationships

- **`scenarios/flows/shop-history.ts`** — Produces the `ages` record (order id → days back) that this file consumes. Shop-history decides *what* date each order should carry; this file *applies* it.
- **`src/modules/orders/model.ts`** — Primary target; two of the eight trail entries update order documents (base date fields, and a conditional nested delivery date guarded by an `$exists` check).
- **`src/modules/payments/model.ts`** — Shifts `createdAt`, `updatedAt`, `receivedAt` on payment docs linked by `orderId`.
- **`src/modules/delivery/model.ts`** — Shifts dates on both `fulfillmentOrder` and `shipment` docs linked by `orderId`.
- **`src/modules/inventory/model.ts`** — Shifts dates on `reservation` docs (`orderId`) and `stockMovement` docs (`reference`).
- **`src/modules/audit-logs/model.ts`** — Shifts `timestamp` on audit rows (`targetId`); also read during `settleAuditTrail` to confirm writes have flushed.

## Notes

- **`updatePipeline: true`** is required by Mongoose 9 for array-based `updateMany`; omitting it throws.
- **`timestamps: false`** is load-bearing — without it, Mongoose would stamp `updatedAt` with the current wall-clock time on the very rows being backdated, undoing the write.
- **String vs ObjectId filters**: `stockmovements` and `auditlogs` store the order id as a plain string (`reference`, `targetId`), not a `MongoObjectId`. The `mover` factory's `find` parameter exists so each collection can use its own naming convention without a shared filter shape.
- **Conditional nested-field update**: The second order entry filters on the existence of a nested fulfillment delivery date. A pipeline `$set` on that dotted path would otherwise create an empty `fulfillment` object on orders that have none, causing a subsequent save to fail on required summary fields.
- **`withdrawUntil` / `conformityUntil`** are shifted alongside `createdAt` so a backdated order does not still show a live withdrawal window.
- **Concurrency model**: Orders are processed in parallel (independent rows), and the eight collection writes within a single order also run in parallel via `Promise.all` (disparate collections, no shared rows).
