---
source: src/modules/orders/services/fulfillment.ts
sha256: ab624f447c78f682ec67c7fe6d5191ee681ab7c8e2fb26cbc4f0dc0c7866752c
generated_at: 2026-10-29T04:47:03.253004+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/services/fulfillment.ts

## Purpose

Thin delegation layer that exposes the "doors" the `delivery` module writes through when a fulfillment act changes where an order's goods stand. Every function forwards to `orderRepository` or `inventoryService` inside the caller's Mongoose transaction, ensuring the shipment record, order summary, status move, and inventory counters commit together or not at all.

## Key elements

- **`recordFulfillmentProgress`** – Writes a `FulfillmentSummary` to the order. Conditional on the order still being fulfillable; makes racing shipment/cancel resolve to one winner. Delegates to `orderRepository.writeFulfillment`.
- **`readOrder`** – Reads the order within the act's transaction session so subsequent writes see a consistent snapshot. Delegates to `orderRepository.findInSession`.
- **`shipStock`** – Decrements shelf stock for the lines a shipment carries. Delegates to `inventoryService.shipLinesForOrder`.
- **`topUpStock`** – Re-reserves units for a reported-lost parcel (from shelf if available, remainder as a restock claim). Mirror of `shipStock` for the lost-parcel case. Delegates to `inventoryService.reserveMoreForOrder`.
- **`releaseTopUp`** – Returns units set aside by `topUpStock` when the lost parcel actually arrives. Hold ends `shipped`, not `released`. Delegates to `inventoryService.releaseTopUpForOrder`.
- **`releaseStock`** – Returns held units for a cancelled remainder that was never shipped. Hold ends `released`. Delegates to `inventoryService.releaseLinesForOrder`.
- **`extendHold`** – Pushes the hold deadline forward by `hours` from now (e.g. for slow bank-debit payments). No session parameter; standalone write. Delegates to `inventoryService.extendHoldForOrder`.
- **`isPayableNow`** – Pre-charge guard: order is in a payable status **and** its hold has not been released. No session; used before charging a card. Reads order via `orderRepository.findByIdScoped`, checks `isPayable` from domain, then queries `inventoryService.isHoldReleased`.
- **`refreshShelf`** – Syncs the catalogue stock cache after a committed transaction. Must be called **after** commit because the cache write cannot roll back. Delegates to `inventoryService.refreshStockCacheForProducts`.

## Relationships

- **`../repository.ts`** (`orderRepository`) – Source for all order-document reads/writes: `writeFulfillment`, `findInSession`, `findByIdScoped`.
- **`../model.ts`** (`OrderDocument`) – The Mongoose document type returned by reads and updated by writes.
- **`../domain`** (`domain/index.ts` → `domain/fulfillment.ts`, `domain/lifecycle.ts`) – Provides the `FulfillmentSummary` type and the `isPayable` status predicate.
- **`@modules/inventory`** (`inventory/index.ts`, `inventory/services/index.ts`, `inventory/services/types.ts`) – Source of `inventoryService` and the `StockLine` / `TopUp` types used across the stock-movement functions.
- **`services/index.ts`** – Re-exports this module so other `orders` services can `import { shipStock, … } from '../services'`.
- **`tests/integration/hold-doors.test.ts`** – Integration tests for the hold lifecycle (`topUpStock`, `releaseTopUp`, `releaseStock`, `extendHold`, `isPayableNow`).
- **`tests/integration/ship-stock.test.ts`** – Integration tests for `shipStock` and the shelf-decrement path.

## Notes

- **Session discipline:** Every function except `extendHold` and `isPayableNow` requires a `ClientSession`. Passing the wrong (or no) session silently breaks atomicity. `refreshShelf` is the one that must run *after* `session.commitTransaction()`, not inside it.
- **`topUp` vs. plain `release`:** `releaseTopUp` transitions the hold to `shipped` (goods left the shelf for good); `releaseStock` transitions it to `released` (goods never left). Mixing them up changes downstream lifecycle invariants.
- **`isPayableNow` is a read, not a write:** It is safe to call outside a transaction and is intended as a pre-charge refusal. It does not un-pay or mutate anything.
- **No business logic here:** This file is pure delegation. All conditional writes, stock arithmetic, and status transitions live in `orderRepository` and `inventoryService`. Bug fixes belong in those, not here.
