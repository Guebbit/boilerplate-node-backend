---
source: src/modules/orders/services/fulfillment.ts
sha256: cd02642e1e8399842af00596b5e0d5641009e19a765f5189418725e6690aefcd
generated_at: 2026-10-15T11:08:12.443015+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/services/fulfillment.ts

## Purpose

The transactional write surface that `delivery` calls when a fulfillment act changes where an order's goods stand. Because `orders` is the sole writer of its own fields, `delivery` reports results (summary, forced-act details, units leaving stock) and this file decides whether each report still applies, binding all writes to the act's `ClientSession` so they commit atomically or not at all.

## Key elements

- **`recordFulfillmentProgress`** — Writes a recomputed `FulfillmentSummary` to the order. Conditional on the order still being in a fulfillable status (`paid` / `processing` / `shipped`), which makes a concurrent shipment-vs-cancel race resolve to exactly one winner.
- **`readOrder`** — Session-scoped read that returns the snapshot the act's own writes will land in, preventing stale refusal decisions at commit time.
- **`ForcedFulfilment`** (interface) — Describes a forced act: `reason`, `actorUserId`, `timestamp`, and the order's prior status.
- **`recordForcedFulfilment`** — Appends a `status_overridden` timeline row recording who forced the step, why, and the status transition (`from` → current). The act may or may not have moved the order; the row documents the override regardless.
- **`shipStock`** — Decrements inventory per shipment line within the shipment's session. Counters drop when goods leave, per shipment, so a later return restocks exactly those units.
- **`refreshShelf`** — Invalidates/refreshes the stock cache for the given products. Deliberately called *after* the transaction commits because the cache write cannot roll back.

## Relationships

- **`../repository.ts`** — All order writes and session reads go through `orderRepository`; this file never touches Mongoose directly.
- **`../domain/fulfillment.ts` / `../domain/index.ts`** — Supplies the `FulfillmentSummary` type that `recordFulfillmentProgress` writes.
- **`../model.ts`** — Provides the `OrderDocument` type used in signatures.
- **`./timeline.ts`** — `appendTimeline` is called by `recordForcedFulfilment` to persist the timeline row in-session.
- **`@modules/inventory` (→ `src/modules/inventory/services/index.ts`)** — `shipStock` and `refreshShelf` delegate to `inventoryService.shipLinesForOrder` and `inventoryService.refreshStockCacheForProducts`.
- **`src/modules/orders/tests/integration/service-override.test.ts`** — Integration-tests the forced-fulfilment path.
- **`src/modules/orders/tests/integration/ship-stock.test.ts`** — Integration-tests `shipStock` / `refreshShelf` behavior.

## Notes

- `refreshShelf` is the **only** export that does not accept a `ClientSession`; it must be awaited after the surrounding transaction has committed. Calling it inside the session is a bug.
- The status guard in `recordFulfillmentProgress` lives in the repository (`writeFulfillment`), not here — the conditional logic is not visible in this file's body.
- `shipStock` decrements **per shipment**, not per order. Multiple shipments on one order each take their own slice, which is what makes per-shipment returns correct.
