---
source: src/modules/orders/domain/backorder.ts
source_sha256: 59620ca1c50f091412bbf8c2dbc75452538409c48f82510eb93475abfbd91d82
context_sha256: d5cc6118934491c1c70786ed6f35fd450da374e7fee2e784f853f00664ebdc76
generated_at: 2026-11-22T06:10:41.779192+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/orders/domain/backorder.ts

## Purpose
Pure domain module describing what an order freezes about the units it owes (backordered units): how many are owed and the day they were promised. It exists so that the owed quantity and its promise date are computed in one place when an order is placed. The file's header points to further background in its `@see` reference (the backorders section of the inventory-reservations doc).

## Key elements
- `OwedLine` (interface): the frozen owed part of one order line.
  - `backorderedQuantity`: number of units owed.
  - `promisedAt`: the promised date.
  - `promiseDated`: a boolean that is set when `promisedAt` is the product's own restock date rather than the 30-day default. This determines whether the buyer is told "by <date>" or "within 30 days", and a later change to the catalogue's date moves only a promise that was product-dated.
- `owedLineOf(owed, restockDate, placedAt, promiseDays)`: returns an `OwedLine`, or `undefined` when `owed` is not greater than 0 (the shelf covered everything).
  - `promisedAt` is `restockDate` if given, otherwise `placedAt + promiseDays * DAY_MS`.
  - `promiseDated` is `restockDate !== undefined`.
  - `promiseDays` is documented as coming from `shop`'s `BACKORDER_PROMISE_DAYS`.

## Relationships
- Imports `DAY_MS` from `src/domain-primitives/time.ts` (via `@domain-primitives/time`) to convert days into milliseconds.
- The other listed neighbors (`src/modules/orders/domain/index.ts`, `src/modules/orders/services/place.ts`, `src/modules/delivery/tests/factories.ts`) are related through the dependency graph. This file's contents don't show how they use it, but its `placedAt` and `promiseDays` parameters correspond to order placement.

## Notes
- The function is pure: it takes `placedAt` as a parameter and does not read the clock or configuration itself.
- The "30-day" default is not hardcoded here; the caller supplies `promiseDays`.
- `restockDate` is checked with `??`/`!== undefined`, so only `undefined` counts as "no restock date".
