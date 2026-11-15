---
source: src/modules/delivery/tests/unit/fulfillment.test.ts
sha256: 40da6c8991fdd26728698086009d872f5293f61aa43376ceeacbcfc67ffc4422
generated_at: 2026-11-14T19:55:04.576227+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/tests/unit/fulfillment.test.ts

## Purpose

Unit tests for the pure fulfillment domain rules: how an order's lines are split into fulfillment-order drafts, what remains after partial shipments or cancellations, which status a group derives from its lines and hold state, and which lines a shipment may carry. No I/O, no mocks — the tested functions are synchronous and side-effect free.

## Key elements

- **`line(productId, quantity, fields?)`** — factory for a `FulfillmentLine` fixture (defaults `shippedQuantity`/`canceledQuantity` to 0).
- **`groupable(productId, quantity, fields?)`** — factory for a `GroupableLine` fixture (defaults `ships: true`); the shape `groupOrderLines` consumes.
- **`describe('groupOrderLines')`** — the bulk of the file. Covers: physical vs digital grouping, mixed orders, per-release-day preorders (ordered, numbered after #1), timezone-aware shop-day grouping (`Europe/Rome`), backorder split (shelf now + owed on hold), fully-backed backorder, dated vs 30-day-default backorders kept apart, preorder vs backorder on the same day, made-to-order (`noWithdrawal`) isolation, preorder + made-to-order separation, preorder-only numbering, dateless preorder treated as ordinary, empty-order edge case.
- **`describe('remaining')`** — verifies `remainingOfLine`, `remainingOf`, and `remainderLines` arithmetic and the zero-remainder exclusion.
- **`describe('statusOfLines')`** — table-driven (`it.each`) covering every (shipped / canceled / held) → status mapping including the "hold on fully-shipped lines is not a hold" case.
- **`describe('checkShipLines')`** — begins validation of which lines a shipment may carry (file is truncated here; the imported surface also includes `isFulfillable`, `isHoldable`, `isReleasable`, `isShippable`, `summarize`, `withRemainderCanceled`, `withShipped`, suggesting further describes follow).

## Relationships

- **`src/modules/delivery/domain/index.ts`** — the sole import target; all tested functions (`groupOrderLines`, `remainingOfLine`, `statusOfLines`, `checkShipLines`, etc.) and types (`FulfillmentLine`, `GroupableLine`) come through this barrel.
- **`src/modules/delivery/domain/fulfillment.ts`** — the implementation module re-exported by the barrel; the actual code under test.

No other listed neighbor (cart services, scenarios, emails, module.ts) is directly imported or referenced by this file.

## Notes

- `line()` and `groupable()` intentionally model **different input shapes**: the former carries `shippedQuantity`/`canceledQuantity` (post-split view), the latter carries `ships`, `preorder`, `backorder`, `noWithdrawal` (pre-split view). Using the wrong helper will silently pass or fail type-check.
- Timezone parameter (`'UTC'` vs `'Europe/Rome'`) changes day-boundary grouping for preorders; tests that assert day-grouping are timezone-sensitive and should not be "fixed" to UTC without understanding the shop-day semantics.
- All tests are synchronous — there are no `async`/`await` or mock setups. If a future refactor makes a domain function async, every affected test will need updating.
- The file is long and densely cases-organized; each `it` is narrowly scoped so failures point directly at one rule clause.
