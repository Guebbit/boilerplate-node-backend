---
source: src/modules/delivery/services/cut.ts
sha256: dfc5714e8146b4a23daa5c5e2ec2b4c2cefcc2f3880963c78122841fc3f246bc
generated_at: 2026-10-29T03:38:46.936261+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/services/cut.ts

## Purpose

The single write path that turns a fulfillment order's remaining lines into a concrete shipment document. Every shipping flow (staff shipping, digital fulfilment, admin override sync) funnels through `cutShipment`, which claims the order by revision, creates the shipment, and optionally decrements stock — all inside one transactional session.

## Key elements

- **`CutInput`** — the fully-resolved input contract: the pre-read fulfillment order, the lines to ship, optional tracking code, and flags (`forced`, `delivered`, `takeStock`) that let callers customise the write.
- **`Cut`** — the return shape: the newly created `ShipmentDocument` plus the updated `FulfillmentOrderDocument`.
- **`cutShipment(input, session)`** — the exported function. Claims the order via `fulfillmentOrderRepository.claim` (optimistic concurrency on `revision`), resolves the encrypted destination, allocates a per-order shipment number, writes the shipment via `shipmentRepository.create`, and conditionally calls `orderService.shipStock`.
- **`destinationFor`** (private) — resolves the order's shipping address through `orderService` and encrypts it with `pii.encryptDestination`, binding the ciphertext to the pre-allocated `shipmentId`. Returns `undefined` for digital (non-physical) orders.
- **`refuse`** (from `./act`) — thrown as an `ActRefusal` (HTTP 409, `DELIVERY_NOT_SHIPPABLE`) when the claim fails because the order's revision moved.

## Relationships

- **`../domain` (`domain/index.ts`)** — imports `statusOfLines`, `withShipped`, and the `ProductQuantity` type used to build the post-ship line state and overall status.
- **`../repository`** — `fulfillmentOrderRepository.claim` performs the revision-guarded update; `shipmentRepository.nextNumber` / `.create` allocate the sequential number and persist the shipment.
- **`../model`** — `FulfillmentOrderDocument` and `ShipmentDocument` shape the input/output and the write payload.
- **`../pii`** — `encryptDestination` produces the address ciphertext stored on the shipment.
- **`./act`** — `refuse` is the shared rejection helper used when the order is no longer shippable.
- **`@modules/orders` (`orders/index.ts`)** — `orderService.readOrder` fetches the parent order for its address; `orderService.shipStock` decrements inventory.
- **`@types` (`types/index.ts`)** — `FulfillmentOrderKind.physical` gates the destination-resolution branch.
- **`../services/ship.ts`, `../services/fulfill.ts`, `../services/override-sync.ts`** — upstream callers that construct a `CutInput` and invoke `cutShipment` within their act transaction.

## Notes

- Operations inside the session are strictly **sequential** (chained `.then`), not parallel — the file comments explicitly note that a Mongoose transaction session does not tolerate concurrent operations.
- `shipmentId` is allocated **before** the destination is resolved so the encryption can bind the ciphertext to that id.
- `takeStock: false` is the escape hatch for override-sync, where inventory was already adjusted by a different code path.
- The `claim` call also **unsets** `holdReason`/`holdNote`, meaning shipping clears any hold unconditionally.
- Line `title` is looked up from the fulfillment order's lines by `productId`; if not found it defaults to an empty string rather than throwing.
