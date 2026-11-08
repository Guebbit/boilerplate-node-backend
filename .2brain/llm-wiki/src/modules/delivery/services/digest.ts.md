---
source: src/modules/delivery/services/digest.ts
sha256: 24e349a1ea46ea2bfdd7288959f61476a31d225a402aee870c348ddf3e37ff67
generated_at: 2026-11-08T05:35:04.258105+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/services/digest.ts

## Purpose

Computes four aggregate counts for the daily staff digest on the delivery side: late preorders, long-open staff holds, shipped parcels missing a tracking code, and parcels shipped but never marked arrived. Returns numbers only — no shipment payloads — so the digest consumer never touches raw shipment data.

## Key elements

- **`DeliveryDigest`** (interface) — the four count fields the caller receives: `preordersLate`, `holdsOpen`, `awaitingTracking`, `undelivered`.
- **`DeliveryDigestAllowance`** (interface) — caller-supplied thresholds (`holdDays`, `trackingHours`, `undeliveredDays`) that define "too long" for each metric.
- **`TRACKING_SCAN_LIMIT`** (const, 1000) — caps how many shipments are fetched when checking for missing tracking codes; the count is approximate beyond this.
- **`countAwaitingTracking`** (internal) — fetches shipped physical parcels with no tracking code before a cutoff, then bulk-resolves each parcel's order shipping method via `orderService.shippingMethodsOf` and filters with `isAwaitingTracking`.
- **`deliveryDigest`** (exported) — the public entry point. Runs all four repository/lookup queries concurrently with `Promise.all` and assembles the `DeliveryDigest` object.

## Relationships

- **`src/modules/delivery/repository.ts`** — calls `fulfillmentOrderRepository.searchBoard` / `.count` and `shipmentRepository.findAll` / `.count` for every metric.
- **`src/modules/orders/index.ts`** — calls `orderService.shippingMethodsOf` (batch lookup) to determine whether a parcel's order uses a tracked shipping method.
- **`src/modules/delivery/domain/index.ts`** — imports the pure predicate `isAwaitingTracking` used to filter the tracking batch.
- **`src/domain-primitives/time.ts`** — imports `DAY_MS` and `HOUR_MS` for converting the allowance values into millisecond offsets.
- **`src/types/index.ts`** — imports the enums `FulfillmentHoldReason`, `FulfillmentOrderKind`, `FulfillmentOrderStatus`, `ShipmentStatus` used in repository query filters.
- **`src/modules/delivery/services/index.ts`** — re-exports `deliveryDigest`, `DeliveryDigest`, and `DeliveryDigestAllowance` as part of the delivery services barrel.
- **`src/modules/delivery/tests/unit/lost.test.ts`** — unit-tests the digest logic (including the `countAwaitingTracking` path).

## Notes

- **Injectable time.** `now` is a parameter, not `Date.now()`; tests can freeze the clock. All four allowance offsets are derived from it.
- **Approximate tracking count.** Because the scan is capped at 1000 shipments, `awaitingTracking` is a lower bound, not an exact count, when the backlog exceeds the limit. The file comment flags this explicitly.
- **Batch method lookup.** `countAwaitingTracking` issues a single `shippingMethodsOf` call for the whole shipment batch rather than one query per parcel, avoiding an N+1 pattern.
- **`Promise.all` concurrency.** The four independent queries run in parallel; a failure in any one rejects the whole digest.
