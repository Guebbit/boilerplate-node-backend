---
source: src/modules/cart/domain/index.ts
sha256: 78b90c0fdb94060ae068f01271fa7af56c5d367e35264c065a394621606c5889
generated_at: 2026-10-15T10:22:44.810363+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/domain/index.ts

## Purpose

Barrel (re-export) file for the cart **domain layer**. It provides a single, stable public surface for all pure business rules and types, so that services and tests import from one path rather than reaching into individual submodules. The file declares no logic of its own — it exists purely to aggregate exports and enforce the "framework-free" boundary noted in `docs/theory/domain-layer.md`.

## Key elements

- **`./rules`** — `evaluateCheckout`, `basketWeight`, `needsShipping`, `evaluateShippingRequirement`; types `CheckoutShortfall`, `UnavailableCartLine`, `ShippingRequirementVerdict`.
- **`./merge`** — `planMergeLine`; types `MergeLineFacts`, `MergePlan`, `MergeReason`.
- **`./stock`** — `fitsStock`.
- **`./availability`** — `lineAvailability`; types `LineAvailability`, `AvailabilityFacts`, `AvailabilityProduct`.

All exports are re-exported (value or type only) with no transformation.

## Relationships

- **`./availability.ts`, `./merge.ts`, `./rules.ts`, `./stock.ts`** — Direct dependency targets; this file re-exports their symbols verbatim.
- **`src/modules/cart/index.ts`** — Upward consumer; the cart module's public entry point is expected to re-export this domain barrel.
- **Services (`checkout`, `items`, `merge`, `preorder`, `shelf`, `view`)** — Downstream consumers that import domain rules/types through this barrel rather than importing submodules directly.
- **Tests (`line-availability.test.ts`, `merge-rule.test.ts`, `stock-rule.test.ts`)** — Unit tests that exercise the re-exported symbols.

## Notes

- Because this is a pure re-export barrel, lint rules (referenced in the file's doc comment) enforce that **no framework imports** leak into the domain layer through this file. Adding a new domain rule means exporting it from the relevant submodule *and* adding it here.
- Type-only exports (`export type { … }`) are kept separate from value exports. Use `import type` or rely on the barrel's `export type` forms when you only need compile-time symbols.
