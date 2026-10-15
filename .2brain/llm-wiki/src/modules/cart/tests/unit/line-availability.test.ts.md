---
source: src/modules/cart/tests/unit/line-availability.test.ts
sha256: e9c9d5148c39a5876c9f1770e5c8498e9cd4d1a385275fa059da4becb9b490a9
generated_at: 2026-10-15T10:25:29.816801+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/tests/unit/line-availability.test.ts

## Purpose

Unit tests for the `lineAvailability` function — the single precedence rule that determines the status of a cart line, wishlist line, merge result, or checkout refusal. Every row of the precedence table is exercised with no mocks and no database.

## Key elements

- **`LIVE`** — a minimal "happy-path" product (`{ active: true, purchasable: true }`) used as the base state each test case bends one field of.
- **`describe('lineAvailability')`** — the top-level suite containing three groups:
  - *Cart line table* (17 `it.each` cases): walks the full precedence ladder from `removed` through `unavailable`, `out_of_stock`, `insufficient_stock`, `preorder`, to `in_stock`, including edge cases like missing `available` field, exact-quantity match, and hidden-preorder interaction.
  - *Wishlist line table* (6 `it.each` cases): confirms the same precedence holds but without the `insufficient_stock` branch.
  - *"never gives a wishlist line insufficient_stock"* — a parametric sweep over several `available` values asserting that string never appears in the result.

## Relationships

- **`src/modules/cart/domain/availability.ts`** — defines `lineAvailability` and the `AvailabilityFacts` type under test.
- **`src/modules/cart/domain/index.ts`** — the re-export barrel from which this file actually imports both symbols (`import { lineAvailability, type AvailabilityFacts } from '../../domain'`).

## Notes

- The precedence order is strictly: `removed` → `unavailable` → `out_of_stock` → `insufficient_stock` → `preorder` → `in_stock`. A hidden product is always `removed` even if also a preorder or off-sale.
- Wishlist lines intentionally never return `insufficient_stock`; the last dedicated test asserts this invariant across a range of stock values.
- Tests are pure table-driven (`it.each` with typed `[label, facts, expected]` tuples); there is no setup/teardown, no spy, and no external I/O.
- The `LIVE` constant intentionally omits fields like `preorder`, `deletedAt`, and `purchasable` defaults, so "a product that never set the flags" still resolves to `in_stock`.
