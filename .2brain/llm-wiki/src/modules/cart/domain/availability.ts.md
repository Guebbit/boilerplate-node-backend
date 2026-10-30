---
source: src/modules/cart/domain/availability.ts
sha256: ee0294b43e5e1167c4a0c5a622c8117121e993bd0b8f3c7e46fa7031d31be86c
generated_at: 2026-10-29T03:21:15.326679+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/domain/availability.ts

## Purpose

Pure domain rule that resolves a single cart line (or wishlist line, merge result, or checkout validation) to one of seven availability states. It encodes the one precedence chain that governs what a saved line can do right now, separating the *judgement* from the *consequences* so callers (presenter, services, checkout) share a single source of truth.

## Key elements

- **`AvailabilityProduct`** — minimal shape the rule reads off a joined product (`active`, `purchasable`, `deletedAt`, `preorder`, `backorder`).
- **`AvailabilityFacts`** — the input bundle: the product (or null for hard-deleted), ledger `available` units, shelf-only units (backorder), and the line's `quantity` (absent for wishlist lines).
- **`lineAvailability(facts): LineAvailability`** — the core judge. First match wins in this fixed order: `removed` → `unavailable` → `out_of_stock` → `insufficient_stock` → `preorder` → `backorder` → `in_stock`.
- **`isBuyable(availability)`** — type-guard returning `true` for `in_stock | preorder | backorder`; the three states a line can convert to an order in.

## Relationships

- **`@types` (`src/types/index.ts`)** — provides the `LineAvailability` union type that `lineAvailability` returns and `isBuyable` narrows.
- **`./stock`** — imports `fitsStock`, used in the `insufficient_stock` branch to compare quantity against available units.
- **`./index.ts`** — re-exports this module so the rest of the cart domain and the presenter consume it through a single barrel.
- **`./rules.ts`** — sibling domain rules; availability is the one that produces the state, rules consume it for higher-level cart invariants.
- **`services/preorder.ts` / `services/shelf.ts`** — supply the `preorder`/`backorder` flags and shelf units that flow into `AvailabilityFacts` before calling `lineAvailability`.
- **`services/view.ts` / `presenter.ts`** — call `lineAvailability` and `isBuyable` to render line state and gate checkout.
- **`tests/unit/line-availability.test.ts`** — unit-tests the precedence chain and edge cases (wishlist lines, null product, zero shelf).

## Notes

- **Wishlist lines have no `quantity`.** The `insufficient_stock` branch is skipped entirely, and the backorder branch uses a different test (`(shelf ?? 0) <= 0`) than a cart line (`quantity > shelf`).
- **`available` is ledger-wide, `shelf` is shelf-only.** For a backorder product, `available` already includes the backorder room; the rule only needs `shelf` to decide whether the line *spills* past the shelf into backorder.
- **`out_of_stock` for a preorder means the allowance is full**, not that the shelf is empty — the two are the same number in the ledger but conceptually distinct.
- **`isBuyable` is intentionally narrower than "not removed/unavailable."** `insufficient_stock` is *not* buyable even though the product exists and is purchasable; the line must be resized first.
- The module is pure: no side effects, no I/O. All "facts" are supplied by the caller, keeping it trivially testable.
