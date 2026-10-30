---
source: src/modules/delivery/domain/tracking.ts
sha256: 7ab59e773f1cc3f24b8c8e95c0f9a979af31de6d06c274383ff566b1e1056595
generated_at: 2026-10-29T03:34:15.650218+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/domain/tracking.ts

## Purpose

Defines the single domain rule that answers "is this shipment still waiting for the carrier's tracking code?" It is the authoritative source for the `Shipment.awaitingTracking` flag and the staff digest's "tracked, still without a code" row, keeping that determination in one place rather than duplicating the logic across services.

## Key elements

- **`TrackingFacts`** (interface) — Minimal read-model a caller supplies: `kind` (physical vs. digital), `status`, and optional `trackingCode`. Keeps the function decoupled from a full `Shipment` entity.
- **`isAwaitingTracking(shipment, shippingMethodId)`** (exported function) — Returns `true` only when **all** four conditions hold: the shipment is `physical`, its status is `shipped`, no `trackingCode` is set, and the looked-up shipping method has `tracked === true`.

## Relationships

- **`./rates`** — Imports `findShippingMethod` to resolve the method by id and read its `tracked` flag.
- **`@types`** — Imports the `FulfillmentOrderKind` and `ShipmentStatus` enums used in the `TrackingFacts` interface and the predicate.
- **`domain/index.ts`** — Barrel file that re-exports this module for consumers within the delivery domain.
- **`services/actions.ts` / `services/digest.ts`** — Downstream services that call `isAwaitingTracking` to populate the shipment flag and the digest row respectively.
- **`tests/unit/tracking.test.ts`** — Unit-test suite covering the predicate's truth table.

## Notes

- The shipping method is **looked up at call time**, not cached at checkout. A later rate-table change (e.g., flipping `tracked` on a method) will immediately change which shipments are considered "awaiting tracking."
- Digital fulfilments are explicitly excluded: they never had a carrier, so the `tracked` check is irrelevant for them.
- The function requires a non-`undefined` `shippingMethodId`; shipments without one are never "awaiting tracking."
