---
source: src/modules/cart/domain/index.ts
sha256: ac573fa9444076f3862e71796239aea2d0d86933d88a24bcf74fe2e5ab94df0b
generated_at: 2026-10-29T03:21:22.526398+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/domain/index.ts

## Purpose

Barrel (re-export) file for the cart **domain layer**. It aggregates the pure, framework-free business rules—checkout validation, stock checks, merge planning, and line availability—into a single import surface so that consumers (services, presenter, tests) never need to reach into individual submodules.

## Key elements

- **`evaluateCheckout`, `basketWeight`, `needsShipping`, `evaluateShippingRequirement`** (from `./rules`) — pure functions that validate a cart against checkout constraints and shipping requirements.
- **`planMergeLine`** (from `./merge`) — computes how an incoming line merges into an existing one.
- **`fitsStock`** (from `./stock`) — determines whether a line quantity is within available stock.
- **`lineAvailability`, `isBuyable`** (from `./availability`) — evaluate per-line buyability from availability facts.
- **Re-exported types** — `AvailabilityFacts`, `AvailabilityProduct`, `MergeLineFacts`, `MergePlan`, `CheckoutShortfall`, `CheckoutVerdict`, `UnavailableCartLine`, `ShippingRequirementVerdict` — shared input/output contracts for the above functions.

## Relationships

- **Depends on** (re-exports from): `domain/rules.ts`, `domain/merge.ts`, `domain/stock.ts`, `domain/availability.ts`.
- **Consumed by**: `src/modules/cart/index.ts` (module-level public API), `presenter.ts`, and the service files (`services/checkout.ts`, `services/items.ts`, `services/merge.ts`, `services/preorder.ts`, `services/shelf.ts`, `services/view.ts`).
- **Tested indirectly** via `tests/unit/line-availability.test.ts`, `tests/unit/merge-rule.test.ts`, `tests/unit/stock-rule.test.ts`.

## Notes

- The module docstring references `docs/theory/domain-layer.md` for the rationale behind the "pure, lint-guaranteed framework-free" constraint.
- Consumers should import from this barrel (or from `src/modules/cart/index.ts`) rather than from individual submodules; the barrel is the intended public contract for the domain layer.
- No logic lives here—it is purely a re-export surface, so changes to function signatures must be made in the source files, not here.
