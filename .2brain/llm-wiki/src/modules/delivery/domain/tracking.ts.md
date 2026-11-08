---
source: src/modules/delivery/domain/tracking.ts
sha256: c3c1d9ca6dfd6986a6ba2ce650213071a249c807cf2f484e4bba4e4f7a09b907
generated_at: 2026-11-08T05:29:48.512956+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/domain/tracking.ts

## Purpose

Defines the single rule that determines whether a shipment is "awaiting tracking" — i.e. it shipped via a tracked method but the carrier's code has not yet been recorded. This one predicate drives the `Shipment.awaitingTracking` flag and the "tracked, still without a code" row in the staff digest.

## Key elements

- **`TrackingFacts`** (interface) — The minimal read-only shape the question needs: `kind` (`physical` vs. digital), `status`, and optional `trackingCode`. Callers construct this from whatever entity they have; the function stays pure.
- **`isAwaitingTracking(shipment, shippingMethodId)`** (exported const) — Returns `true` only when all of the following hold:
  1. `kind` is `FulfillmentOrderKind.physical`
  2. `status` is `ShipmentStatus.shipped`
  3. `trackingCode` is absent
  4. `shippingMethodId` is defined **and** `findShippingMethod(id)?.tracked === true`

## Relationships

- **`./rates` → `findShippingMethod`** — Called *live* at evaluation time (not cached from checkout), so a rate-table change retroactively changes which shipments count as "awaiting."
- **`@types`** — Source of the `FulfillmentOrderKind` and `ShipmentStatus` enums used in the predicate.
- **`domain/index.ts`** — Barrel file; re-exports this module so consumers can import from the domain root.
- **`services/actions.ts`, `services/digest.ts`** — Downstream consumers that call `isAwaitingTracking` when building actions or the digest summary row.
- **`tests/unit/tracking.test.ts`** — Unit tests covering the truth table of the predicate.

## Notes

- The shipping-method lookup is **not** frozen at order creation. If ops toggles `tracked` on a rate, the set of "awaiting" shipments changes immediately on the next call — no migration needed, but also no historical stability.
- The function is pure over its inputs (no I/O, no date checks). Any time-sensitivity (e.g. "has been waiting > N days") belongs to the caller, not here.
- Digital shipments (`kind !== physical`) always return `false` regardless of status or code — there is no carrier to produce a code.
