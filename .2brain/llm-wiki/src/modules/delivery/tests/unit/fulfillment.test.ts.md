---
source: src/modules/delivery/tests/unit/fulfillment.test.ts
sha256: 1fd4a73d3a2da0ee340ed585bdb3f302b934e3ccef1ada0e76efd88fa13f87c2
generated_at: 2026-10-29T03:49:09.475848+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/tests/unit/fulfillment.test.ts

## Purpose
Unit tests for the pure fulfillment domain rules: how an order's lines are grouped into fulfillment orders, how remaining quantities are computed, what status derives from a set of lines and a hold flag, and which lines a shipment may carry. It exists to lock down the grouping, remainder, status, and shipping-validation logic without any I/O.

## Key elements
- **`line(productId, quantity, fields?)`** — local factory returning a `FulfillmentLine` with `shippedQuantity`/`cancelledQuantity` defaulting to 0.
- **`groupable(productId, quantity, fields?)`** — local factory returning a `GroupableLine` (the shape `groupOrderLines` reads), with `ships: true` by default.
- **`describe('groupOrderLines', …)`** — the largest block. Covers: ordinary → single physical order; digital-only → digital order; mixed orders stay in one physical order; preorder release-day splitting (chronological, timezone-aware day grouping); backorder partial-coverage (shelf portion ships, owed portion holds); fully backordered lines (no open order); dated vs. 30-day-default backorder separation; preorder + backorder same-day isolation; made-to-order (`noWithdrawal`) lines getting their own group; edge cases (empty order, undated preorder treated as ordinary).
- **`describe('remaining', …)`** — tests `remainingOfLine`, `remainingOf`, and `remainderLines` (excludes fully-shipped lines).
- **`describe('statusOfLines', …)`** — parameterized table covering the full status matrix: `open`, `in_progress`, `on_hold`, `closed`, `cancelled`, and the "hold with nothing remaining" override.
- **`describe('checkShipLines', …)`** — tests the shipping-validation gate (truncated in source; covers "ship all remaining when no lines are named" and partial-selection cases).

## Relationships
- **Imports all tested functions from `src/modules/delivery/domain/index.ts`** (`checkShipLines`, `groupOrderLines`, `isFulfillable`, `isHoldable`, `isReleasable`, `isShippable`, `remainderLines`, `remainingOf`, `remainingOfLine`, `statusOfLines`, `summarize`, `withRemainderCancelled`, `withShipped`) plus the types `FulfillmentLine` and `GroupableLine`.
- The functions under test are implemented across the sibling domain files: `domain/fulfillment.ts` (grouping, status, remainder), `domain/preorder.ts` (release-day logic), and `domain/reship.ts` (shipping validation). This test file is the sole unit-test consumer of that API surface.

## Notes
- Timezone is passed explicitly as the second argument to `groupOrderLines` (`'UTC'` or `'Europe/Rome'`); grouping of preorders by "shop day" is timezone-sensitive, not UTC-day-based.
- Preorder lines *without* a `releaseDate` are treated as ordinary (open) — the tests assert this explicitly.
- `defaulted` is an optional marker on a fulfillment-order draft; a `true` value indicates the 30-day default promise rather than an explicit date, and such groups must not merge with dated ones.
- The `summarize`, `withRemainderCancelled`, and `withShipped` imports are present but their tests appear beyond the truncated portion of the file.
