---
source: src/modules/cart/domain/index.ts
sha256: ac573fa9444076f3862e71796239aea2d0d86933d88a24bcf74fe2e5ab94df0b
generated_at: 2026-11-08T05:13:07.830056+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/domain/index.ts

## Purpose

Barrel (re-export) file for the cart domain layer. It aggregates the public API of the four domain submodules—`rules`, `merge`, `stock`, and `availability`—into a single import surface, so consumers can `import { … } from '@/modules/cart/domain'` instead of reaching into individual files. Contains no logic of its own.

## Key elements

- **From `./rules`** — `evaluateCheckout`, `basketWeight`, `needsShipping`, `evaluateShippingRequirement` (functions); `CheckoutShortfall`, `CheckoutVerdict`, `UnavailableCartLine`, `ShippingRequirementVerdict` (types)
- **From `./merge`** — `planMergeLine` (function); `MergeLineFacts`, `MergePlan` (types)
- **From `./stock`** — `fitsStock` (function)
- **From `./availability`** — `lineAvailability`, `isBuyable` (functions); `AvailabilityFacts`, `AvailabilityProduct` (types)

## Relationships

- **Re-exports from** (direct children): `availability.ts`, `merge.ts`, `rules.ts`, `stock.ts` — the four files whose symbols are surfaced here.
- **Imported by** (consumers): `src/modules/cart/index.ts` (module-level public API), `presenter.ts`, and the service files (`checkout.ts`, `items.ts`, `merge.ts`, `preorder.ts`, `shelf.ts`, `view.ts`) all pull domain functions/types through this barrel.
- **Verified by** (tests): `line-availability.test.ts`, `merge-rule.test.ts`, `stock-rule.test.ts` exercise the functions re-exported from this file.

## Notes

- The file is **pure re-export only**; there is no conditional logic, no side effects, and no code execution at import time.
- The module doc-comment states the domain layer is "lint-guaranteed framework-free"—meaning no framework imports should appear in any file under `domain/`, and this barrel enforces that boundary by being the sole entry point.
- When adding a new domain rule, create it in the appropriate sibling file and add the re-export here; consumers should import from this barrel rather than from the leaf module directly.
