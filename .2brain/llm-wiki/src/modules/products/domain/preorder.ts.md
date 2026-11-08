---
source: src/modules/products/domain/preorder.ts
sha256: 796c800bc963851d5fc7041110675347d87f2ca256bf8f270e0372f1b1886499
generated_at: 2026-11-08T07:43:51.044364+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/domain/preorder.ts

## Purpose

Pure domain rules for determining whether a product is a preorder (on sale but not yet released) and what the maximum allowed release date is. The file exists so that preorder logic lives in the products domain as clock-injected, side-effect-free functions that any consumer (cart, presenter, order snapshot) can call without duplicating the rule.

## Key elements

- **`PreorderFacts`** (interface) — The minimal read-only slice of a product the rule needs: `active`, `purchasable`, `releaseDate`. All fields are optional; absent flags default to `true`.
- **`isPreorder(facts, now)`** (exported function) — Returns `true` when the product is active, purchasable, and has a `releaseDate` strictly after `now`. Preorder is a *derived* state; it self-reverts when the date passes.
- **`latestReleaseDate(now)`** (exported function) — Returns the upper bound for a release date: exactly one UTC calendar year after `now`. Uses `setUTCFullYear` so a leap day cannot shift the result.

## Relationships

- **`domain/index.ts`** — Barrel file; re-exports `PreorderFacts`, `isPreorder`, and `latestReleaseDate` so consumers import from the module root.
- **`domain/buyable.ts`** — Sibling domain rule; the `purchasable` flag in `PreorderFacts` mirrors the concept defined there.
- **`domain/backorder.ts`** — Sibling domain rule covering the complementary "out of stock but orderable" case.
- **`model.ts`** — The product model that supplies the `active`, `purchasable`, and `releaseDate` fields read by `PreorderFacts`.
- **`presenter.ts`** — Maps product state (including whether it is a preorder) into a presentable shape for the UI.
- **`src/modules/cart/services/preorder.ts`** — Downstream consumer that likely calls `isPreorder` / `latestReleaseDate` when building cart validation or line-item logic.
- **`tests/unit/preorder.test.ts`** — Unit tests exercising both exported functions with injected clocks.

## Notes

- **Clock injection is mandatory.** Neither function reads `Date.now()`; the caller always supplies the instant. Tests should never mock the system clock.
- **Default-true convention.** Omitted `active`/`purchasable` are treated as `true` (the product is visible and on sale). An absent `releaseDate` means the product is *not* a preorder.
- **UTC calendar-year math.** `latestReleaseDate` deliberately uses UTC to avoid a ±1-day drift around Feb 29. If a consumer does local-time comparisons, the bound may appear one day early or late in non-UTC timezones.
- **Derived, not persisted.** Preorder status is always computed at read time. There is no database flag, no background job, and no "un-preorder" step—consistent with BigCommerce and WooCommerce behavior noted in the module docblock.
