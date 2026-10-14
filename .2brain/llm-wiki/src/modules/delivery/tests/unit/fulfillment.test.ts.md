---
source: src/modules/delivery/tests/unit/fulfillment.test.ts
sha256: 509c02f7d56915b06a98ccb306554dd742fb879eecf300adc4d826a7417c316c
generated_at: 2026-10-14T15:39:25.987057+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/tests/unit/fulfillment.test.ts

## Purpose

Unit tests for the pure fulfillment domain rules: how an order's lines are split into fulfillment orders (grouping), how remaining quantities are computed, what status follows from a line set and hold state, which lines a shipment may carry, how the summary is assembled for the `orders` module, and which action predicates (`isShippable`, `isHoldable`, etc.) a fulfillment order exposes.

## Key elements

- **`line(productId, quantity, fields?)`** – fixture factory returning a `FulfillmentLine` with zero shipped/cancelled by default.
- **`groupable(productId, quantity, fields?)`** – fixture factory returning a `GroupableLine` (adds `ships`, `preorder`, `releaseDate`).
- **`describe('groupOrderLines')`** – verifies physical/digital/mixed grouping, per-release-day hold grouping with `agreedAt` set to the day's latest instant, numbering starting at 1, and edge cases (empty order, preorder with no date).
- **`describe('remaining')`** – covers `remainingOfLine`, `remainingOf`, and `remainderLines` arithmetic and filtering.
- **`describe('statusOfLines')`** – table-driven (`it.each`) over the full status matrix: `open`, `in_progress`, `on_hold`, `closed`, `cancelled`.
- **`describe('checkShipLines')`** – validates ship-request acceptance/rejection: all-remaining, nothing-remains, named-line summation, unknown product, over-quantity.
- **`describe('withShipped and withRemainderCancelled')`** – confirms immutability (input arrays untouched) and correct quantity bookkeeping; includes a getter-based "stored subdocument" case.
- **`describe('summarize')`** – checks the summary object handed to `orders`: `shipped`, `remaining`, `onHold`, `awaitingStock`, `undelivered`, `lastDeliveredAt`.
- **`describe('what a fulfillment order offers')`** – asserts the action predicates (`isShippable`, `isFulfillable`, `isHoldable`, `isReleasable`) for each fulfillment-order shape.

## Relationships

- **`src/modules/delivery/domain/index.ts`** – re-exports the pure functions under test (`groupOrderLines`, `statusOfLines`, `checkShipLines`, `withShipped`, `withRemainderCancelled`, `summarize`, `isShippable`, etc.); this file imports exclusively from that barrel.
- **`src/modules/delivery/domain/fulfillment.ts`** – the implementation that these tests verify (imported via the barrel above).
- **`src/modules/delivery/services/cut.ts`** – calls `groupOrderLines` and `checkShipLines` at runtime; the tests here pin the contract it relies on.
- **`src/modules/delivery/presenter.ts`** – calls `summarize` and the action predicates to shape what `orders` sees.
- **`src/modules/delivery/services/notify.ts` / `announce.ts`** – consume `statusOfLines` to decide which notifications fire.
- **`src/modules/cart/services/checkout.ts`** – produces the order lines that ultimately become `GroupableLine` inputs to `groupOrderLines`.

## Notes

- The suite tests **pure functions only** (no I/O, no DB, no HTTP); the "stored subdocument" test simulates a Mongoose-style object whose fields live behind getters, because a plain spread won't copy them — `withShipped`/`withRemainderCancelled` must read via property access, not spread.
- Preorder grouping is **per release-day**, not per release-instant; the `agreedAt` of a day's group is the **latest** `releaseDate` in that group, not the earliest.
- `statusOfLines` treats a hold on a fulfillment order where **nothing remains** as irrelevant (returns `closed`, not `on_hold`); the test name calls this out explicitly.
- The file is self-contained: every fixture is built inline; no external test utilities or shared setup are imported.
