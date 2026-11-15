---
source: src/modules/delivery/services/cut.ts
sha256: 4432e754e4d56a3344c333c6b5bcfc114963efc5467dc5816b3c79a1d84fd682
generated_at: 2026-11-14T19:45:00.122876+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/services/cut.ts

## Purpose

Implements the "cut" — the single write path that creates a shipment from a fulfillment order inside the act's transaction. All shipping paths (staff shipping, digital fulfillment, admin status override) funnel through `cutShipment`. It uses optimistic concurrency (revision claim) so two acts racing the same remainder cannot both land.

## Key elements

- **`CutInput`** (interface) — Parameters for a cut: the snapshot-read fulfillment order, the lines to ship, optional tracking code, `forced`/`delivered` flags, timestamp, and `takeStock`.
- **`Cut`** (interface) — Return shape: the newly written `ShipmentDocument` and the claimed (updated) `FulfillmentOrderDocument`.
- **`destinationFor`** (private) — Resolves the order's shipping address via `orderService`, then encrypts it under the shipment's pre-allocated `_id`. Returns `undefined` for digital or address-less orders.
- **`writeShipment`** (private) — Builds and inserts the shipment document via `shipmentRepository.create`, mapping line titles from the fulfillment order and setting status to `'delivered'` or `'shipped'`.
- **`cutShipment`** (exported) — Orchestrates the full cut: claims the fulfillment order by revision, allocates a shipment id, resolves destination, fetches the next shipment number, writes the shipment, and optionally decrements stock. Rejects with `ActRefusal` on revision mismatch.

## Relationships

- **`src/modules/delivery/domain/fulfillment.ts`** and **`src/modules/delivery/domain/index.ts`** — Provide `withShipped` (merges shipped lines into the order's lines), `statusOfLines` (derives order status), and the `ProductQuantity` type.
- **`src/modules/delivery/repository.ts`** — `fulfillmentOrderRepository.claim` performs the optimistic revision check; `shipmentRepository.create` and `.nextNumber` persist the shipment.
- **`src/modules/delivery/pii.ts`** — `encryptDestination` encrypts the address bound to the shipment id.
- **`src/modules/delivery/model.ts`** — `FulfillmentOrderDocument` and `ShipmentDocument` type the documents read and written.
- **`src/modules/delivery/services/act.ts`** — `refuse` produces the `ActRefusal` thrown on revision conflict.
- **`src/modules/orders/index.ts`** and **`src/modules/orders/services/index.ts`** — `orderService` is used to read the order (for the address) and to `shipStock` (decrement inventory).
- **`src/types/index.ts`** — `FulfillmentOrderKind` enum to distinguish physical from digital orders.
- **Callers** — `src/modules/delivery/services/ship.ts`, `src/modules/delivery/services/fulfill.ts`, and `src/modules/delivery/services/override-sync.ts` each invoke `cutShipment` within their own act transaction.
- **Tests** — `src/modules/delivery/tests/unit/fulfillment.test.ts` and `src/modules/delivery/tests/unit/lost.test.ts` exercise the cut path as part of broader fulfillment scenarios.

## Notes

- Operations inside the transaction are strictly **sequential**; the comment notes that a Mongoose session does not tolerate parallel operations.
- The destination ciphertext is bound to the shipment's own `_id` (allocated *before* the write), so re-encryption under a different id is not possible.
- `takeStock` is `false` when an admin override already handled inventory; the caller is responsible for that distinction.
- Claiming the fulfillment order **unsets** `holdReason` and `holdNote` — shipping is treated as ending any active hold.
- Line titles are copied from the fulfillment order at cut time; if a line is missing the title defaults to `''` rather than throwing.
