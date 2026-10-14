---
source: src/modules/delivery/services/split.ts
sha256: 38474e2dcfacb4090892451fdf685b76fc0d8d909a74e47067131dbacd7529ae
generated_at: 2026-10-14T15:34:17.356126+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/services/split.ts

## Purpose

Splits a fulfillment order that is held for `awaiting_stock` when partial stock arrives. The allocated units are carved into a new `open` fulfillment order (ready to ship) while the remainder stays on hold. If the arrival covers the full outstanding quantity, the hold is simply lifted and no second order is created. This runs only inside a transaction initiated by `releaseAllocated`; no HTTP route reaches it directly.

## Key elements

- **`Split`** (exported interface) — Result shape: `released` is the fulfillment order now free to ship; `held` (optional) is the shrunken order that remains on hold. `held` is `undefined` when the allocation covered everything.
- **`splitForAllocation(fulfillmentOrderId, allocated)`** (exported) — Public entry point. Loads the fulfillment order, verifies the parent order is not cancelled, then runs `splitAct` inside `runAct`. Returns `Split | undefined`; `undefined` signals a refusal (order gone, cancelled, wrong hold reason, or allocation exceeds remaining).
- **`splitAct`** (module-internal) — Transactional core. Validates status/hold-reason, checks ship-eligibility via `checkShipLines`, then takes one of two paths:
  - *Full cover*: claims the held order in place, clears `holdReason`/`holdNote`, reports progress, and announces release.
  - *Partial*: claims the held order with shrunk lines, creates a sibling order (next sequential `number`), reports progress, and announces release.
- **`withoutAllocated(lines, allocated)`** (module-internal) — Returns the held order's lines with allocated quantities subtracted; drops any line whose quantity reaches zero.
- **`allocatedLines(held, allocated)`** (module-internal) — Maps allocated units into new-order lines (zero shipped, zero cancelled), resolving product titles from the held order.

## Relationships

- **`release-allocated.ts`** — Sole caller of `splitForAllocation`; invokes it within the inventory-allocation flow for paid preorders.
- **`domain/index.ts` / `fulfillment.ts`** — Provides `checkShipLines`, `remainingOfLine`, `statusOfLines`, and the `FulfillmentLine` / `ProductQuantity` types used throughout.
- **`repository.ts`** — All persistence goes through `fulfillmentOrderRepository` (`findInSession`, `claim`, `findByOrderId`, `create`, `findById`).
- **`model.ts`** — Supplies the `FulfillmentOrderDocument` type.
- **`act.ts`** — Provides `runAct` (transaction wrapper), `refuse`, and `refuseMissing` (structured refusal results).
- **`announce.ts`** — `announceReleased` fires the `fulfillment_order.released` event after a successful split.
- **`progress.ts`** — `reportProgress` updates the order-level progress document in the same transaction.
- **`orders/index.ts`** — `orderService.getById` is called to guard against cancelled parent orders before the transaction starts.
- **`@types` (types/index.ts)** — `FulfillmentHoldReason` and `FulfillmentOrderStatus` enum values used in validation.

## Notes

- **Optimistic concurrency**: both `claim` calls pass `held.revision`; a concurrent mutation causes a `409 DELIVERY_NOT_RELEASABLE` refusal rather than a silent overwrite.
- **Refusal, not exception**: `splitForAllocation` returns `undefined` on every refusal path. The caller (`releaseAllocated`) must treat `undefined` as "nothing was released" rather than a thrown error.
- **Order numbering**: the new sibling's `number` is `max(siblings) + 1` over all fulfillment orders sharing the same `orderId`, so it is correct even after multiple prior splits.
- **`agreedAt` / `expectedAt`** are conditionally copied to the new order (only when present on the held order), avoiding writing `undefined` into the document.
- **No admin surface**: the doc comment notes there is no staff-facing button; the split is purely automatic, triggered by inventory allocation.
