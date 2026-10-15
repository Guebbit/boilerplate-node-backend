---
source: src/modules/products/domain/preorder.ts
sha256: 796c800bc963851d5fc7041110675347d87f2ca256bf8f270e0372f1b1886499
generated_at: 2026-10-15T11:41:28.585079+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/domain/preorder.ts

## Purpose

Pure domain logic for determining whether a product is currently a preorder (on sale, not yet released) and what the maximum allowed release date is. All time-dependent checks receive `now` as an argument so tests need no clock mocking or waiting.

## Key elements

- **`PreorderFacts`** (interface) — the minimal product fields the rule inspects: `active?`, `purchasable?`, `releaseDate?`. Absent `active`/`purchasable` are treated as `true`.
- **`isPreorder(facts, now)`** (function) — returns `true` only when the product is active, purchasable, has a `releaseDate`, and that date is strictly in the future relative to `now`.
- **`latestReleaseDate(now)`** (function) — returns the date one UTC calendar year after `now`; this is the upper bound for any `releaseDate` a product may be assigned.

## Relationships

- **`src/modules/products/domain/index.ts`** — barrel file that re-exports `PreorderFacts`, `isPreorder`, and `latestReleaseDate` for the rest of the products module.
- **`src/modules/products/model.ts`** — defines the product shape from which callers extract the fields required by `PreorderFacts`.
- **`src/modules/products/presenter.ts`** — consumes `isPreorder` to decide how to render/present a product's preorder state.
- **`src/modules/cart/services/preorder.ts`** — applies the same domain rule (or its outputs) in cart-level preorder logic.
- **`src/modules/orders/services/snapshot.ts`** — reads preorder facts when capturing an order snapshot.
- **`src/modules/products/tests/unit/preorder.test.ts`** — unit tests for `isPreorder` and `latestReleaseDate`.
- **`src/modules/orders/tests/factories.ts`** — test factories that build product/order fixtures exercising the preorder path.

## Notes

- Preorder status is **derived, never persisted**. When the release date passes, `isPreorder` simply returns `false` on the next read; there is no scheduled job. This mirrors BigCommerce and WooCommerce auto-revert behaviour.
- `latestReleaseDate` uses **UTC calendar years** (`setUTCFullYear` + 1) specifically so a Feb 29 → Mar 1 shift cannot sneak the bound forward by a day.
- `releaseDate` must be strictly *after* `now` (`>`); a product whose release date equals `now` is **not** a preorder.
