---
source: src/modules/orders/services/fulfillment.ts
sha256: dbf597971c695d97e4e809ab7eed6c00f14a62e70de62feb75c0128818696450
generated_at: 2026-11-14T20:43:15.776146+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/services/fulfillment.ts

## Purpose

The transactional write path that the `delivery` module calls when a fulfillment act changes where an order's goods stand. Because `orders` is the sole writer of its own fields, this file receives the report (summary, step history, units moved) and decides whether each write still applies. Every door accepts the act's Mongoose session so the shipment, summary, status move, and events commit atomically or not at all.

## Key elements

- **`recordFulfillmentProgress`** — Writes the recomputed `FulfillmentSummary` onto the order. The write is conditional on the order still being in a fulfillable status (`paid`/`processing`/`shipped`/`delivered`), which is what makes a racing shipment-vs-cancel resolve to exactly one winner. Returns the updated order or `null`.
- **`readOrder`** — Reads the order inside the act's transaction so downstream refusals see the same snapshot the act's writes will land in.
- **`shipStock`** — Drops shelf units for a shipment (per-shipment accounting so a later return restocks units that were actually taken).
- **`topUpStock`** — Re-reserves units for a shipment reported lost: shelf units first, remainder as a claim on the restock (outside the backorder cap). Mirror of `shipStock` for the lost-parcel case.
- **`releaseTopUp`** — Returns what `topUpStock` set aside when the lost parcel eventually arrives. Hold ends `shipped`, not `released`, because the goods left the shelf for good.
- **`releaseStock`** — Returns held units for a canceled remainder that was never shipped. Hold ends `released`.
- **`extendHold`** — Pushes an open hold's expiry `hours` into the future (e.g. slow bank-debit windows). No-op if the hold is already claimed or missing.
- **`isPayableNow`** — Pre-charge gate: order is awaiting payment **and** its hold has not been released. Post-charge doors do not call this.
- **`refreshShelf`** — Invalidates/refreshes the catalogue stock cache. Must be called **after** the transaction commits because the cache write cannot roll back.

## Relationships

- **`src/modules/orders/repository.ts`** — `orderRepository` is the only data-access path used here (`writeFulfillment`, `findInSession`, `findByIdScoped`).
- **`src/modules/orders/domain/` (index, `fulfillment.ts`, `lifecycle.ts`)** — Provides the `FulfillmentSummary` type and the `isPayable` status predicate consumed by `recordFulfillmentProgress` and `isPayableNow`.
- **`src/modules/inventory/index.ts` / `services/index.ts`** — `inventoryService` is the delegate for every stock-mutating call (`shipLinesForOrder`, `reserveMoreForOrder`, `releaseTopUpForOrder`, `releaseLinesForOrder`, `extendHoldForOrder`, `isHoldReleased`, `refreshStockCacheForProducts`).
- **`src/modules/inventory/services/types.ts`** — Source of the `StockLine` and `TopUp` types that appear in function signatures.
- **`src/modules/orders/model.ts`** — `OrderDocument` is the return type of `recordFulfillmentProgress` and `readOrder`.
- **`src/modules/orders/tests/integration/ship-stock.test.ts`** — Exercises the `shipStock` / `releaseStock` / `topUpStock` / `releaseTopUp` flow.
- **`src/modules/orders/tests/integration/hold-doors.test.ts`** — Exercises `extendHold` and the hold-related invariants.

## Notes

- **`shipStock` vs `topUpStock`** are easy to confuse: `shipStock` permanently drops shelf count (goods are going out); `topUpStock` re-reserves because the goods are expected to come back. Their release counterparts mirror this — `releaseStock` ends the hold as `released`, `releaseTopUp` ends it as `shipped`.
- **`isPayableNow` is a pre-charge check only.** Doors that record money already taken intentionally skip it; refusing there would not un-pay anything.
- **`refreshShelf` has no session parameter** by design — it runs after commit. Passing a session to it would be a bug.
- **`extendHold` is the only function with no session and no return value.** It is best-effort and safe to call on a missing/claimed hold (it silently no-ops).
- The conditional write in `recordFulfillmentProgress` is the race-resolution mechanism: it is the single point where "still fulfillable?" is evaluated, so a concurrent cancel and shipment cannot both succeed.
