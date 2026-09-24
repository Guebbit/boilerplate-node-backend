---
source: src/modules/cart/tests/unit/domain-rules.test.ts
sha256: 0d646283003f4f4dea8968a7dd9e6f7849c43e897deba0c9cae6c0024c07ee42
generated_at: 2026-09-23T18:34:24.184963+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/tests/unit/domain-rules.test.ts

## Purpose

Pure unit tests for the cart domain rules (`evaluateCheckout` and `basketWeight`) in `rules.ts`. No mocks, no database — the rules are plain functions, so the tests call them directly with hand-built fixtures. A third describe block cross-validates the availability subtraction that `rules.ts` duplicates internally against the inventory module's `availabilityOf`, since the domain layer is not allowed to import a sibling module.

## Key elements

- **`line(quantity, onHand?, reserved?)`** — local factory returning a `CartLineCandidate`. Accepts `onHand` and `reserved` separately so a fixture can express "0 on shelf" vs. "40 on shelf, 40 promised."
- **`describe('evaluateCheckout')`** — covers: empty cart, all-resolved acceptance, deleted/absent product (null vs. undefined), deactivated/soft-deleted product (title still surfaced), ordering of refusal reasons (emptiness → resolution → stock), exact-boundary acceptance, all-reserved refusal, absent-counter refusal (safe-fail to zero), and resolution outranking stock.
- **`describe('basketWeight')`** — covers: weighted sum, missing/`null` weight treated as zero (not a refusal), and empty basket returning 0.
- **`describe('availability agrees with the inventory authority')`** — table-driven boundary test (including the unreachable `reserved > onHand` case) that drives `evaluateCheckout` at exactly `available` and `available + 1` units, asserting the verdict matches `availabilityOf` from inventory. Catches a drifting off-by-one in `rules.ts`'s private copy of the subtraction.

## Relationships

- **`src/modules/cart/domain/rules.ts`** — the system under test; imports `evaluateCheckout`, `basketWeight`, and the `CartLineCandidate` type.
- **`src/modules/inventory/index.ts`** — barrel entry point resolved by the `@modules/inventory` alias; re-exports `availabilityOf` used in the cross-validation block.
- **`src/modules/inventory/domain/transitions.ts`** — likely source of the `availabilityOf` logic that the cross-validation block compares against (imported via the inventory barrel).

## Notes

- Verdict-to-HTTP-status mapping is **explicitly out of scope** here; that belongs in `service.test.ts`.
- The `line()` helper omits `product` entirely when `onHand` is `undefined`, producing the "absent counters" fixture. Do not simplify to a single number — the two counters are semantically distinct.
- The cross-validation describe block is the only place a test file may import both the cart rule and the inventory authority; `rules.ts` itself cannot make that import due to domain-layer isolation.
- Refusal-reason ordering is intentional (empty → product-unavailable → insufficient-stock) because each maps to a different status code and analytics category.
