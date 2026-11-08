---
source: src/modules/orders/services/digest.ts
sha256: 30ccfd1d3e95be5887fcfab7209fdc1f68019445e407de367e1cbbcb686fba8c
generated_at: 2026-11-08T06:57:03.240225+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/services/digest.ts

## Purpose

Provides the two aggregate figures the daily staff digest reads from the orders domain: bank transfers about to lapse and paid orders left unshipped. Returns counts only — no order data is materialized or held, keeping the digest lightweight.

## Key elements

- **`OrdersDigest`** (interface) — shape of the digest result: `transfersDue: number` and `unshipped: number`.
- **`ordersDigest(now, { transferHours, unshippedDays })`** — runs two `orderRepository.count` queries in parallel (`Promise.all`) and returns an `OrdersDigest`. First counts pending bank-transfer orders whose `payBy` is within `transferHours` of `now`; second counts paid/processing orders whose `paidAt` is more than `unshippedDays` ago.
- **`shippingMethodsOf(orderIds)`** — fetches the frozen `shippingMethod` for a set of orders and returns a `Map<string, string | undefined>` keyed by order id. Short-circuits to an empty Map when `orderIds` is empty.

## Relationships

- **`src/domain-primitives/time.ts`** — imports `DAY_MS` and `HOUR_MS` to convert the `allowance` parameters into concrete `Date` thresholds.
- **`src/infrastructure/persistence/create-repository.ts`** — imports `toObjectId` to convert string ids to Mongo ObjectIds in the `shippingMethodsOf` query.
- **`src/modules/orders/repository.ts`** — imports `orderRepository`; all data access in this file (both `count` and `findAll` calls) goes through it.
- **`src/modules/orders/services/index.ts`** — barrel file that re-exports this module for consumers of the orders services package.

## Notes

- Both count queries explicitly filter `deletedAt: null` (soft-delete awareness); omitting this would include logically deleted orders.
- `shippingMethodsOf` converts ids via `toObjectId` before querying, whereas `ordersDigest` never needs an `_id` lookup — the two functions use different repository call signatures (`count` with plain filters vs. `findAll` with an ObjectID `_id` filter).
- The `findAll` call in `shippingMethodsOf` passes `limit: orderIds.length`, assuming the repository's `findAll` accepts a `limit` option.
- An order that froze no shipping method at checkout maps to `undefined` in the returned Map (per the JSDoc contract).
