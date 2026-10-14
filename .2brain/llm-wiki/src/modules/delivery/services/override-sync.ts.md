---
source: src/modules/delivery/services/override-sync.ts
sha256: e575486d3ff9cc9e08602ee43851d626d97544eb1e4c54581260fe83994d54b0
generated_at: 2026-10-14T15:31:29.956496+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/services/override-sync.ts

## Purpose

Listener for the `order.status_overridden` event: when an admin manually moves an order to `shipped` or `delivered`, this module reconciles the fulfillment records by force-shipping any unfulfilled remainder and (for `delivered`) marking all outstanding shipments as delivered. The resulting shipments are `forced`, take no stock, and fire no email or webhook, honoring the override's "no parcel, no email" contract.

## Key elements

- **`syncWithOverride(orderId, to, at)`** *(exported)* — Entry point. No-ops unless `to` is `shipped` or `delivered`. Wraps the work in a `runAct` transaction, then: ships every fulfillment order's remainder sequentially, optionally delivers outstanding shipments, and re-reports progress. Idempotent; a redelivered event is a safe no-op.
- **`shipRemainder(fulfillmentOrder, to, at, session)`** — If the order has remaining lines, calls `cutShipment` with `forced: true`, `takeStock: false`, and `delivered` set when the target is `delivered`. Resolves immediately when nothing remains.
- **`deliverOutstanding(orderId, at, session)`** — Loads all shipments for the order and marks each one still in `shipped` status as `delivered` at the override's instant.

## Relationships

- **`./cut.ts`** — Calls `cutShipment` to create the forced remainder shipments.
- **`./act.ts`** — Calls `runAct` to open the transactional session.
- **`./progress.ts`** — Calls `reportProgress` to refresh the order's aggregate status after shipping/delivering.
- **`../repository.ts`** — Reads via `fulfillmentOrderRepository.findByOrderId` and `shipmentRepository.findByOrderId` / `markDelivered`.
- **`../domain/`** (`fulfillment.ts`, `index.ts`) — Uses `remainderLines` and `remainingOf` to compute what is still unshipped.
- **`../model.ts`** — Types the `FulfillmentOrderDocument` parameter.
- **`@types`** (`types/index.ts`) — Imports `OrderStatus` for the status guard.
- **`../module.ts`** — Registers `syncWithOverride` as the `order.status_overridden` listener.
- **`../services/index.ts`** — Re-exports `syncWithOverride` for external consumers.
- **`../tests/integration/override-sync.test.ts`** — Integration tests covering the shipped/delivered/other-status paths.

## Notes

- All per-order operations run **sequentially** inside the transaction; the comments explicitly note that a Mongoose session does not support parallel operations. Do not "optimize" to `Promise.all`.
- The `at` timestamp is the override's own instant (the same reference point `withdrawUntil` used), not `Date.now()`. Callers must pass it in.
- Because shipments are `forced` with `takeStock: false`, no inventory is decremented and no outbound notifications are emitted. This is intentional, not an oversight.
- `syncWithOverride` is idempotent: re-delivering the event finds zero remaining lines and zero `shipped` shipments, and `reportProgress` simply rewrites the same summary.
