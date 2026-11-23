---
source: src/modules/cart/domain/index.ts
source_sha256: 815491a55e594da22d9ec9f8c69c49b519d704f6470f000a3aa3318a63bd6b55
context_sha256: ee08b33b6669870b2057cef08dfc32a0a42bef7707f7c3733754fc17d14829c0
generated_at: 2026-11-22T04:32:06.081138+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/cart/domain/index.ts

## Purpose
Public barrel for the cart domain layer. It re-exports the pure, framework-free business rules (checkout, merge, stock, availability) and their types from the sibling files, so other cart code can import from one entry point. The module doc states the layer is lint-guaranteed to be framework-free.

## Key elements
- **From `./rules`:** `evaluateCheckout`, `basketWeight`, `needsShipping`, `evaluateShippingRequirement`.
  - Types: `CheckoutShortfall`, `CheckoutVerdict`, `UnavailableCartLine`, `ShippingRequirementVerdict`.
- **From `./merge`:** `planMergeLine`.
  - Types: `MergeLineFacts`, `MergePlan`.
- **From `./stock`:** `fitsStock`.
- **From `./availability`:** `lineAvailability`, `isBuyable`.
  - Types: `AvailabilityFacts`, `AvailabilityProduct`.

## Relationships
- Aggregates `rules.ts`, `merge.ts`, `stock.ts`, and `availability.ts`. It contains no logic of its own.
- The other neighbors are the cart module's entry (`src/modules/cart/index.ts`), `presenter.ts`, the services (`checkout`, `items`, `merge`, `preorder`, `shelf`, `view`) and the unit tests (`line-availability`, `merge-rule`, `stock-rule`). They are linked to this file through the dependency graph. The file's content does not show which symbols each one uses.

## Notes
- It is a re-export-only file. Add new domain rules to the relevant sibling file and export them here.
- Types are exported with `export type`, separately from the values.
- The module doc comment says the layer is lint-guaranteed to be framework-free, and refers to a section on the lint rule in the project's domain-layer documentation.
