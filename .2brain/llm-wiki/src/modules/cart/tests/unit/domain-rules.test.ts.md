---
source: src/modules/cart/tests/unit/domain-rules.test.ts
sha256: eb587cc11c22b8ae37effa53ec62b36f705e4e9a1dcf2e71e12fb4c6cded9cbb
generated_at: 2026-10-15T10:25:20.699886+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/tests/unit/domain-rules.test.ts

## Purpose

Unit tests for the three pure cart domain functions in `rules.ts` (`evaluateCheckout`, `basketWeight`, `evaluateShippingRequirement`). No mocks, no database — the input lines are constructed inline to exercise every branch of the decision logic. The verdict-to-HTTP-status mapping is explicitly out of scope (covered in `service.test.ts`).

## Key elements

- **`line(quantity, available?)`** — helper that builds a minimal `CartLineCandidate`; `available` is optional (its absence is itself a test target).
- **`preorder(quantity, available)`** — helper for a preorder line carrying `productId`, `title`, and `preorder: true`.
- **`shipped(requiresShipping?)`** — helper for `evaluateShippingRequirement` tests; defaults to a physical product.
- **`describe('evaluateCheckout')`** — covers: empty cart, fully-resolved cart, preorder allowance, hard-deleted (`null`) vs hidden/soft-deleted products, insufficient stock, off-sale (`purchasable: false`), sold-out vs short (distinct `availability` strings), hidden outranking off-sale, exact-stock acceptance, fully-reserved units, absent `available` as refusal, and resolution-priority over availability-priority.
- **`describe('basketWeight')`** — sums `weight × quantity`, treats missing weight / `null` product as zero, returns 0 for empty basket.
- **`describe('evaluateShippingRequirement')`** — digital-only basket needs nothing; physical basket requires a method; address is required only when the chosen method demands one; one physical line among digital lines still triggers the requirement.

## Relationships

- **`src/modules/cart/domain/rules.ts`** — the sole import target. Provides the three functions under test and the `CartLineCandidate` type. No other module is touched.

## Notes

- **Absent `available` means refuse, not allow.** The tests pin down that `undefined` stock is read as "nothing to sell" (insufficient-stock), not "unconstrained." This is a deliberate safety choice documented in the test comments.
- **Priority is fixed:** `product-unavailable` (404-shaped) is reported before `insufficient-stock` (409-shaped) before `empty`. The "reports an unresolved product before an unavailable one" test guards this ordering.
- **`availability` strings are distinct:** `out_of_stock` (available = 0), `insufficient_stock` (0 < available < requested), `unavailable` (off-sale). A mixed-basket test asserts both can appear in one `shortfalls` array.
- **Hidden/inactive outranks off-sale:** a product with both `active: false` and `purchasable: false` is reported as `product-unavailable`, not `insufficient-stock`.
- **Reservation model:** `available` represents what remains *after* holds, not the raw warehouse count. The "refuses a line whose units are all reserved" test exists specifically to distinguish this from the old single-count model.
