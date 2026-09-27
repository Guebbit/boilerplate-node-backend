---
source: src/modules/cart/tests/unit/domain-rules.test.ts
sha256: 44277904ecf8654ba7ba3c59f4b99dcd8185598599d0d54176010e2f9b7153fd
generated_at: 2026-09-27T14:48:39.006398+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/tests/unit/domain-rules.test.ts

## Purpose

Unit tests for the three pure cart-domain rules in `rules.ts` — checkout eligibility, basket weight, and shipping-requirement gating. The file exists to pin down edge-case semantics (deleted products, reserved stock, absent `available`, digital vs. physical lines) without any mocks or database, relying on the functions' stated pre-conditions (the caller has already resolved `available` via the products module).

## Key elements

- **`line(quantity, available?)`** — local factory that builds a `CartLineCandidate`. When `available` is omitted the `product` field is `{}` (i.e. no `available` key), simulating "unknown stock."
- **`shipped(requiresShipping?)`** — local factory for a single-line cart entry used by the shipping-requirement tests.
- **`describe('evaluateCheckout')`** — 11 specs covering: empty cart, valid cart, hard-deleted / soft-deleted / deactivated products, insufficient stock (including all-reserved `available: 0`), boundary "exactly the last units," absent `available` treated as zero, and priority ordering (unresolved product reported before insufficient stock).
- **`describe('basketWeight')`** — 3 specs: sum of `quantity × product.weight`, missing/null weight treated as 0, empty array → 0.
- **`describe('evaluateShippingRequirement')`** — 6 specs: digital-only basket needs nothing, physical basket requires a method, address requirement is conditional on the chosen method's `requiresAddress` flag, and a single physical line among digital lines still triggers the method requirement.

## Relationships

- **`src/modules/cart/domain/rules.ts`** — the sole import source; all tested functions (`evaluateCheckout`, `basketWeight`, `evaluateShippingRequirement`) and the `CartLineCandidate` type live there. This file exercises them in isolation (no service layer, no HTTP mapping).

## Notes

- The module doc comment explicitly states that the **verdict-to-HTTP-status mapping is NOT covered here**; that belongs to `service.test.ts`.
- `available === undefined` (key absent) is asserted to mean **refuse with `available: 0`**, not "unlimited." If the rule's behavior ever changes, this is the spec that encodes the safe-default decision.
- Test data deliberately includes `product: null` (hard-deleted row absent from the catalogue join) *and* `product: { active: false }` / `{ deletedAt }` (unscoped join still returns the row). The distinction matters for the `title` field in the error payload.
- No test imports `jest`, a DB driver, or any mock — the file is a pure-function test by design.
