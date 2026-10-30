---
source: src/modules/delivery/services/digest.ts
sha256: eafb0fa9072a17908b1d43f25191e15cfbcff77f443e01061d0682b3bf182e58
generated_at: 2026-10-29T03:39:15.042306+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/services/digest.ts

## Purpose

Computes four attention counts for the daily staff digest on the delivery side: late preorders, over-age holds, shipped parcels missing a tracking code, and undelivered parcels. Returns numbers only — no shipment or order data — so the digest payload stays small.

## Key elements

- **`DeliveryDigest`** (interface) — the four count fields: `preordersLate`, `holdsOpen`, `awaitingTracking`, `undelivered`.
- **`DeliveryDigestAllowance`** (interface) — caller-supplied time thresholds (`holdDays`, `trackingHours`, `undeliveredDays`) that define when each count starts accruing.
- **`TRACKING_SCAN_LIMIT`** (const, 1000) — caps how many shipments are fetched for the awaiting-tracking check; the resulting count is an approximation on large backlogs.
- **`countAwaitingTracking`** (internal) — queries `shipmentRepository` for shipped physical parcels with no `trackingCode`, then batch-asks `orderService` for the shipping method of each and filters via `isAwaitingTracking`.
- **`deliveryDigest`** (exported function) — runs all four queries in parallel with `Promise.all`, maps the results into a `DeliveryDigest`, and returns a `Promise<DeliveryDigest>`.

## Relationships

- **`src/domain-primitives/time.ts`** — imports `DAY_MS` / `HOUR_MS` to convert allowance values into cutoff `Date`s.
- **`src/modules/delivery/domain/index.ts`** (→ `tracking.ts`) — imports `isAwaitingTracking` to decide whether a given shipping method actually requires a code.
- **`src/modules/delivery/repository.ts`** — imports `fulfillmentOrderRepository` (preorders, holds) and `shipmentRepository` (awaiting-tracking, undelivered) for all DB access.
- **`src/modules/orders/index.ts`** (→ `services/index.ts`) — imports `orderService` and calls `shippingMethodsOf` once for the whole batch of order IDs.
- **`src/types/index.ts`** — imports the `FulfillmentHoldReason`, `FulfillmentOrderKind`, `FulfillmentOrderStatus`, and `ShipmentStatus` enums used in query filters.
- **`src/modules/delivery/services/index.ts`** — barrel that re-exports this module for consumers.
- **`src/modules/delivery/tests/unit/lost.test.ts`** — unit tests that exercise the digest counts.

## Notes

- The `preordersLate` count is obtained via `searchBoard({ late: true }, …)` with `limit: 1`, reading only `totalItems` from the response — a counting idiom that avoids materialising results.
- `holdsOpen` explicitly excludes the `awaiting_stock` hold reason; only staff-initiated holds are counted.
- `awaitingTracking` is **not** an exact count when the untracked backlog exceeds 1000 shipments (documented in the `TRACKING_SCAN_LIMIT` comment).
- The function is declared as a plain arrow returning `Promise.all(…).then(…)` rather than `async`, so it always returns a promise and never throws synchronously.
