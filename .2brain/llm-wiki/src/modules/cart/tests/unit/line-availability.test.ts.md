---
source: src/modules/cart/tests/unit/line-availability.test.ts
sha256: 0302103562389909e02bd4f3013d1c28e9487985f1d393517a80a096f526bb2c
generated_at: 2026-10-29T03:30:46.748793+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/tests/unit/line-availability.test.ts

## Purpose
Unit tests that exhaustively exercise the `lineAvailability` precedence table (cart and wishlist variants) and the `isBuyable` gate. The file exists to pin down every row of the availability decision matrix so that cart, wishlist, merge, and checkout all agree on a single source of truth.

## Key elements
- **`LIVE`** — shared base fixture (`{ active: true, purchasable: true }`) that every test case mutates by spreading and overriding one or two fields.
- **`describe('lineAvailability')` / cart-line table** — ~25 `it.each` rows covering: removed, unavailable, out_of_stock, insufficient_stock, in_stock, preorder, backorder, and their edge combinations (hidden + off-sale, preorder + hidden, backorder + unlimited stock, etc.).
- **`describe('lineAvailability')` / wishlist-line table** — 8 rows where `quantity` is intentionally omitted, confirming the same state set minus `insufficient_stock`.
- **`it('never gives a wishlist line insufficient_stock')`** — property-style guard: sweeps multiple `available` values and asserts the result set excludes `insufficient_stock`.
- **`describe('isBuyable')`** — asserts `true` for `{in_stock, preorder, backorder}` and `false` for `{insufficient_stock, out_of_stock, unavailable, removed}`.

## Relationships
- **`src/modules/cart/domain/availability.ts`** — implements `lineAvailability`, `isBuyable`, and the `AvailabilityFacts` type under test. This file is the sole behavioral contract for that module.
- **`src/modules/cart/domain/index.ts`** — the barrel re-export through which the test imports `isBuyable`, `lineAvailability`, and `AvailabilityFacts` (`import { … } from '../../domain'`).

## Notes
- Tests are pure: no mocks, no database, no async. Each row is a synchronous call-then-`toBe` assertion.
- The wishlist table omits the `quantity` field from `AvailabilityFacts`; the cart table always supplies it. This is the only structural difference between the two test suites.
- Backorder logic is tested as `available + shelf ≥ quantity → in_stock`, `shelf < quantity ≤ available + shelf → backorder`, `available + shelf < quantity → insufficient_stock`.
- Preorder explicitly ignores `shelf` (one test row sets `shelf: 9` and still expects `preorder`).
- The `LIVE` constant sets both `active` and `purchasable` to `true`; individual rows override whichever flag they need to flip. A row with `{}` (neither flag set) is treated as in-stock, confirming the defaults are permissive.
