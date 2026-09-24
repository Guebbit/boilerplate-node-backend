---
source: src/modules/delivery/tests/unit/rates.test.ts
sha256: 18c094754ab00fe48318da9f23bcd69dd146c95e716e69d7cadd675dcd9ebda5
generated_at: 2026-09-23T18:38:34.596544+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/tests/unit/rates.test.ts

## Purpose

Unit tests for the pure shipping-rate functions in `domain/rates.ts`. No database, no mocks — it exercises the pricing table and the weight/threshold rules in isolation. The doc header explicitly separates this from `tests/integration/service.test.ts`, which exists because *persistence* of a shipment needs a real DB; the pricing rule itself does not.

## Key elements

- **`findShippingMethod`** — asserts lookup by `id` returns the full method object; asserts an unoffered id (`'overnight'`) yields `undefined`.
- **`priceShipping`** — covers four pricing paths: flat rate below the free-shipping threshold, zero cost at/above threshold, flat rate when a method declares no threshold, and pickup returning `0` (distinguished from "no method found").
- **`methodFitsWeight`** — verifies that a method with no `minWeight`/`maxWeight` accepts any weight; boundary checks at `maxWeight` (5000 vs 5001 g) and `minWeight` (999 vs 1000 g). The minWeight case builds an inline object because no shipped method declares one today.
- **`methodsForWeight`** — checks that `undefined` weight returns the full `SHIPPING_METHODS` array; that a 10 000 g basket excludes express but keeps standard + pickup; that 40 000 g leaves only pickup.
- **`SHIPPING_METHODS` canary tests** — iterates the committed table to assert every `price ≥ 0` and every `tracked` is a real `boolean`, catching typos before they surface at checkout.

## Relationships

- **`src/modules/delivery/domain/rates.ts`** — sole import target. Every `describe` block exercises one export (`findShippingMethod`, `priceShipping`, `methodFitsWeight`, `methodsForWeight`, `SHIPPING_METHODS`). The test file treats the domain module as a pure, side-effect-free surface; no other module or service is involved.

## Notes

- The `minWeight` test deliberately constructs a synthetic method object rather than pulling from `SHIPPING_METHODS`, so the branch stays covered even though no current method declares a floor.
- `SHIPPING_METHODS` is treated as *committed data*, not user input; the canary assertions are cheap guards against a one-character typo producing a wrong price at runtime.
- Numeric literals use underscores (`1_000_000`, `10_000`, `40_000`) for readability.
- The file header references `tests/integration/service.test.ts` as the companion for persistence-level concerns — do not conflate the two.
