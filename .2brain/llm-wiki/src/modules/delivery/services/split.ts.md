---
source: src/modules/delivery/services/split.ts
sha256: a08360ceab55fe876e2ea100f99076d25e549584d2a64fc3f2352f09bf92d7eb
generated_at: 2026-11-14T19:51:14.752143+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/services/split.ts

## Purpose
Implements the "short-stock split": when a preorder line requested more units than arrived in stock, the arrived units are moved into a new `open` fulfillment order (which can ship immediately) while the remainder stays `on_hold` with `awaiting_stock`. Without this split the partial stock could never ship because a manual release of `awaiting_stock` is refused. Called exclusively by `releaseAllocated` when inventory allocates stock to a paid preorder; no HTTP route reaches it.

## Key elements
- **`Split`** (exported interface) — result shape: `released` (the order that may now ship) and optional `held` (the shrunk order still waiting; absent when the allocation covered everything).
- **`withoutAllocated`** (private) — subtracts the allocated quantity from each line of the held order, dropping lines that reach zero.
- **`allocatedLines`** (private) — builds the new order's lines from the allocated units, copying `title` from the held order, initializing `shippedQuantity`/`canceledQuantity` to 0.
- **`splitAct`** (private) — the transactional core. Validates status/hold-reason, checks the allocation against remaining lines. Two paths:
  - *Covers-all:* the hold is simply released (status updated, `holdReason`/`holdNote` unset) on the existing order.
  - *Partial:* shrinks the held order via `claim`, then `create`s a new sibling fulfillment order (next sequential `number`, same `kind`, dates, `sourceShipmentId`).
- **`splitForAllocation`** (exported function) — public entry point. Loads the fulfillment order, verifies the parent order isn't canceled, then runs `splitAct` inside a Mongoose session via `runAct`. Returns `undefined` on any refusal.

## Relationships
- **`src/modules/delivery/domain/index.ts`** (`checkShipLines`, `remainingOfLine`, `statusOfLines`, `FulfillmentLine`, `ProductQuantity`) — validation helpers and shared types for line arithmetic.
- **`src/modules/delivery/domain/fulfillment.ts`** (`plainLine`) — strips non-persisted fields before re-serializing a line into the shrunk order.
- **`src/modules/delivery/repository.ts`** (`fulfillmentOrderRepository`) — all persistence: `findInSession`, `claim` (optimistic-concurrency update), `create`, `findByOrderId`.
- **`src/modules/delivery/services/act.ts`** (`runAct`, `refuse`, `refuseMissing`) — transaction wrapper and error-refusal helpers.
- **`src/modules/delivery/services/announce.ts`** (`announceReleased`) — notifies the order of the release within the same transaction.
- **`src/modules/delivery/services/progress.ts`** (`reportProgress`) — updates the order's progress summary in the same transaction.
- **`src/modules/delivery/services/release-allocated.ts`** — the sole caller of `splitForAllocation`.
- **`src/modules/orders/index.ts`** (`@modules/orders`) — provides the order service used to verify the parent order is not canceled before splitting.
- **`src/types/index.ts`** (`FulfillmentHoldReason`, `FulfillmentOrderStatus`) — domain enum values used in status checks.
- **`src/modules/delivery/model.ts`** (`FulfillmentOrderDocument`) — the persisted document type carried through the split.

## Notes
- **No route calls this.** The only caller is `releaseAllocated`; the admin UI has no "split" button. An admin can still manually hold the newly-created `open` order to re-ship everything together.
- **Fast path avoids a write.** When the allocation covers every remaining line (`covers` is true), the existing order is updated in place — no second document is created.
- **`sourceShipmentId` propagation.** The new order inherits `sourceShipmentId` from the held order so a later lost-parcel recovery can locate all outstanding parts across split siblings.
- **Optimistic concurrency.** Both the shrink (`claim` on the held order) and the full-release path use the held order's `revision` number; a concurrent modification causes a 409 refusal rather than a silent overwrite.
- **Numbering.** The new order's `number` is `max(siblings) + 1` computed within the same session, avoiding gaps if the held order is the only sibling.
