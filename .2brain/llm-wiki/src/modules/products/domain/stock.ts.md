---
source: src/modules/products/domain/stock.ts
sha256: 78c3c370e12d03e458274edc587b3d1b199b22f27c0ffd83e3066597f49ea746
generated_at: 2026-09-27T15:31:46.480337+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/domain/stock.ts

## Purpose

Derives a customer-facing "available to buy" count from the two inventory counters (`onHand`, `reserved`) that `@modules/inventory` writes onto every product. It lives in the products domain (not in inventory or cart) because a product's catalogue availability is the product module's own invariant, following the same layering rationale as `tax.ts`'s `resolveTaxRate`.

## Key elements

- **`availableStock(onHand?: number, reserved?: number): number`** — Pure function that returns `Math.max(0, (onHand ?? 0) - (reserved ?? 0))`. Both parameters are optional and read as zero when absent. The result is clamped at zero so a negative count can never reach the UI.

## Relationships

- **`src/modules/products/model.ts`** — The product model carries the `onHand` and `reserved` counters that this function consumes; `availableStock` is the domain rule that turns those raw counters into a sellable quantity.
- **`src/modules/products/domain/index.ts`** — Barrel file that re-exports `availableStock` for consumers importing from the domain namespace.
- **`src/modules/cart/services/checkout.ts`** — Downstream consumer; calls `availableStock` to validate that requested quantities are within what a customer may actually buy.
- **`src/modules/products/tests/unit/stock.test.ts`** — Unit tests exercising the clamp-at-zero and optional-parameter behaviors.
- **`src/modules/products/tests/factories.ts`** — Test factories that produce product fixtures with specific `onHand`/`reserved` values for the above tests.

## Notes

- `reserved` is expected to never exceed `onHand` (every inventory transition guards it), but the function still clamps defensively — treat the zero-floor as a safety net, not a business rule.
- Both parameters are optional by design: a product that has never been inventoried has no counters, and both read as zero.
