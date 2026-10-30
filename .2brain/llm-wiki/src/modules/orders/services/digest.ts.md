---
source: src/modules/orders/services/digest.ts
sha256: e396dc14541cd61fac28e34a283bbfab5d67297ece340dfd94aaf8355cb54bd0
generated_at: 2026-10-29T04:46:45.532561+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/services/digest.ts

## Purpose

Supplies the two order-side counts for the daily staff digest: bank-transfer orders nearing or past their `payBy` deadline, and paid/processing orders that have waited too long for shipment. Returns numbers only — no order data is surfaced to the digest layer.

## Key elements

- **`OrdersDigest`** (interface) — `{ transfersDue: number; unshipped: number }`, the shape returned by `ordersDigest`.
- **`ordersDigest(now, { transferHours, unshippedDays })`** — runs two `orderRepository.count` queries in parallel (`Promise.all`) and resolves with the two counts. Filters soft-deleted rows (`deletedAt: null`).
- **`shippingMethodsOf(orderIds)`** — batch-fetches orders by ID and returns a `Map<string, string | undefined>` of order id → frozen `shippingMethod`. Short-circuits to an empty `Map` when `orderIds` is empty.

## Relationships

- **`src/domain-primitives/time.ts`** — provides `DAY_MS` / `HOUR_MS` constants used to build the time-window boundaries in both count queries.
- **`src/infrastructure/persistence/create-repository.ts`** — provides `toObjectId`, used in `shippingMethodsOf` to convert the string IDs into Mongo ObjectIds before the `$in` filter.
- **`src/modules/orders/repository.ts`** — the `orderRepository` instance whose `.count()` and `.findAll()` methods are the sole data access calls in this file.
- **`src/modules/orders/services/index.ts`** — barrel file that re-exports `OrdersDigest`, `ordersDigest`, and `shippingMethodsOf` to the rest of the codebase.

## Notes

- Both count queries use `$lte` against a computed `Date`, so `transfersDue` includes orders whose `payBy` has **already passed**, not just those within the window.
- The "unshipped" query matches statuses `'paid'` **and** `'processing'` — an order in `processing` is still considered unshipped if it has no shipment record and `paidAt` is old enough.
- `shippingMethodsOf` keys the map by `String(order._id)` rather than the raw ObjectId, so callers can match against the string IDs they already hold.
- The `limit: orderIds.length` in the `findAll` call guards against over-fetching if the `$in` array is large.
