---
source: src/modules/orders/services/digest.ts
sha256: 2c7d0d236bae63a2911d3774b0e2ea53ed81bd482b4eea96b58bcceab07d3702
generated_at: 2026-11-14T20:42:42.237908+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/services/digest.ts

## Purpose

Provides the order-side counts for the daily staff digest: bank-transfer orders approaching or past their `payBy` deadline, and paid orders still awaiting shipment beyond a configurable allowance. Also exposes a small lookup for the shipping method each order froze at checkout. The digest holds counts only—no order records are returned.

## Key elements

- **`OrdersDigest`** (interface) — the two-count shape: `transfersDue` (bank-transfer, pending, `payBy` within window or overdue) and `unshipped` (awaiting shipment longer than the allowance).
- **`ordersDigest(now, { transferHours, unshippedDays })`** — fires two `orderRepository.count` queries in parallel via `Promise.all` and returns an `OrdersDigest`. The transfer window is measured forward from `now`; the unshipped window is measured backward from `now`.
- **`shippingMethodsOf(orderIds)`** — resolves a `Map<string, string | undefined>` of order ID → frozen shipping-method ID. Returns an empty map immediately for an empty input array.

## Relationships

- **`src/domain-primitives/time.ts`** — imports `DAY_MS` and `HOUR_MS` to convert the hour/day allowances into millisecond offsets for the Mongo queries.
- **`src/modules/orders/domain/fulfillment.ts`** — imports `fulfillmentStatusFilter('awaiting_shipment')` to build the compound `$and` filter for the unshipped count; this is the same predicate the digest's "awaiting shipment" link uses.
- **`src/modules/orders/repository.ts`** — imports `orderRepository` and calls its `count` (twice) and `findByIds` methods.
- **`src/modules/orders/services/index.ts`** — barrel file for the orders services; this module is re-exported through it.

## Notes

- Both `count` queries explicitly include `deletedAt: null` to exclude soft-deleted orders.
- `transfersDue` uses `payBy <= now + transferHours` (i.e., the deadline has arrived *or* is within the window), while `unshipped` uses `paidAt <= now - unshippedDays` (i.e., the order is *older* than the allowance). The asymmetry (forward vs. backward from `now`) is intentional.
- `shippingMethodsOf` may map an order to `undefined` if no shipping method was frozen at checkout; callers must handle the optional value.
- The transfer query hard-codes `status: 'pending'` and `paymentMethod: 'bank_transfer'` rather than deriving them from the domain layer—intentional, since these are literal digest criteria, not a general fulfillment status.
