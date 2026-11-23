---
source: src/modules/inventory/tests/integration/repository.test.ts
source_sha256: 3872fe243e81ba3e2dc65e3c49e5fceaf40a34e5e3ecda334b11ab96c24070db
context_sha256: 6158aa1a00b46bd7a995d3f1af68bed91e6778e3e7355e0bf06b74032aa1d1f7
generated_at: 2026-11-22T05:27:45.751341+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/inventory/tests/integration/repository.test.ts

## Purpose
Integration tests for `stockLevelRepository`'s aggregate reads against a real Mongo instance. They cover the empty-collection answers (where `$group`/`$facet` pipelines return no row, so the `.at(0)` guard is asserted) and the way the two stock gauges count different populations. The transition path (`applyDelta`, `insertIfAbsent`) is deliberately left to the transition service's own tests.

## Key elements
- `setupTestDb()` — called at module level to provision the test database.
- `describe('an empty collection')`:
  - `sumReserved()` resolves to `0`.
  - `stockBoard({ skip: 0, limit: 10 })` resolves to `{ items: [], totalItems: 0 }`.
  - `lowAvailabilityProductIds(5)` resolves to `[]`.
- `describe('the two stock gauges count different populations')`:
  - `beforeEach` clears `stockLevelModel` with `deleteMany({})`.
  - `lowAvailabilityProductIds` returns every low-availability candidate, visible or not. The test uses three products: available 2, available 0 (all reserved), and a hidden one with available 1. It checks the result with `expect.arrayContaining` on stringified `_id`s.
  - `sumReserved` counts reserved units for active and inactive products alike (40 + 1 = 41).

## Relationships
- `src/modules/inventory/repository.ts` — the system under test (`stockLevelRepository`: `sumReserved`, `stockBoard`, `lowAvailabilityProductIds`).
- `src/modules/inventory/model.ts` — `stockLevelModel` is used to wipe the collection between tests.
- `src/modules/products/tests/factories.ts` — `createProduct({ active, onHand, reserved })` seeds products along with their stock levels.
- `tests/support/setup-test-db.ts` — sets up the real Mongo test DB.

## Notes
- Availability is `onHand - reserved`, not `onHand`. A fully reserved product counts as low.
- The repository applies no visibility filter. Narrowing to publicly visible products is `products`' rule, applied by `src/modules/inventory/services/levels.ts`, and it is tested in a separate service test rather than here. So the stock board's `lowOnly` count (whole catalogue) and `lowStockCount` (visible only) can differ by design.
- Only the second `describe` clears the collection explicitly, and it clears `stockLevelModel` only, not `products`. The empty-collection tests rely on `setupTestDb()` for isolation.
