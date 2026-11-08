---
source: src/modules/delivery/services/override-sync.ts
sha256: e575486d3ff9cc9e08602ee43851d626d97544eb1e4c54581260fe83994d54b0
generated_at: 2026-11-08T05:37:20.029383+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/services/override-sync.ts

## Purpose

Listener for the `order.status_overridden` event. When an admin manually moves an order's status to `shipped` or `delivered`, this module reconciles the fulfillment records by force-cutting any remaining lines as a shipment and, if the target is `delivered`, marking outstanding shipments as delivered — all stamped with the override's own timestamp.

## Key elements

- **`syncWithOverride(orderId, to, at)`** (exported) — Entry point. No-ops unless `to` is `shipped` or `delivered`. Otherwise runs a single transactional act: ships remainders for every fulfillment order, delivers outstanding shipments (if targeting `delivered`), then reports progress.
- **`shipRemainder(fulfillmentOrder, to, at, session)`** (module-private) — Cuts a forced shipment for a fulfillment order's remaining lines, or resolves immediately if nothing remains. Sets `delivered: true` when the target is `delivered`.
- **`deliverOutstanding(orderId, at, session)`** (module-private) — Queries all shipments for the order and marks those still in `shipped` status as delivered.

## Relationships

- **`../domain`** (`fulfillment.ts` via `domain/index.ts`) — imports `remainderLines` and `remainingOf` to compute what is left to ship.
- **`../repository.ts`** — uses `fulfillmentOrderRepository.findByOrderId` and `shipmentRepository.findByOrderId` / `markDelivered` for all data access.
- **`../model.ts`** — imports the `FulfillmentOrderDocument` type.
- **`./act.ts`** — wraps all work in `runAct` to get a Mongoose transaction session.
- **`./cut.ts`** — calls `cutShipment` to materialise the forced shipment.
- **`./progress.ts`** — calls `reportProgress` at the end of the act to refresh the order's summary.
- **`./index.ts`** — barrel file that re-exports `syncWithOverride` for external consumers.
- **`@types`** (`src/types/index.ts`) — imports the `OrderStatus` enum.
- **`tests/unit/reship.test.ts`** — unit tests that exercise the reship/override-sync path.

## Notes

- **Sequential, not parallel:** Both the per-fulfillment-order loop and the per-shipment delivery loop are deliberately sequential because a Mongoose transaction session does not support concurrent operations.
- **Forced shipments are silent:** `cutShipment` is called with `takeStock: false`; no email or webhook fires. This upholds the override's "no parcel, no email" contract.
- **Idempotent:** A redelivered event simply finds zero remaining lines and zero outstanding shipments, then rewrites the same progress summary.
- **Only `shipped` and `delivered` are actionable:** Any other override target (e.g. reverting to `pending`) is a no-op here; other listeners handle it.
- **Timestamp provenance:** The `at` parameter is the instant the admin applied the override, not `Date.now()` at execution time. It is the same instant `withdrawUntil` was computed from.
