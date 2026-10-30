---
source: src/modules/cart/domain/rules.ts
sha256: b4ab06b34008d831b3e0a8a16aa02220c8eb3d6b97025a83576c65f03ead3718
generated_at: 2026-10-29T03:21:48.367229+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/domain/rules.ts

## Purpose

Pure, stateless cart rules that produce typed verdicts (`ok` / `refused + reason`). No status codes, no i18n, no side-effects — the services layer maps these verdicts to HTTP responses. Exists so that checkout gating, shipping-requirement checks, and basket weight calculations all share one definition of "sellable" and "needs to ship."

## Key elements

- **`CartLineCandidate`** — shape of a cart line as the rules see it. `product: null` means the catalogue join found nothing (hard delete); a non-null `product` with `active: false` or a soft-delete is "present but not sellable."
- **`UnavailableCartLine`** — one line refused because no sellable product exists behind it.
- **`CheckoutShortfall`** — one line refused for availability reasons (off-sale, sold-out, etc.). Carries `productId`, `title`, `requested` quantity, and the specific `availability` reason.
- **`WeighedCartLine`** — minimal interface for weight/shipping math (`quantity`, `product.weight`, `product.requiresShipping`).
- **`isShippedLine`** *(private)* — single predicate: `product?.requiresShipping !== false`. Shared by `basketWeight` and `needsShipping` so "counts toward weight" and "needs a method" can never disagree.
- **`basketWeight(lines)`** — total grams across shipped lines (`weight × quantity`). Digital goods contribute 0. Used both to filter delivery-method lists (advisory) and to refuse a checkout whose chosen method is too light (enforced).
- **`needsShipping(lines)`** — `true` if at least one line ships.
- **`ShippingRequirementVerdict`** / **`evaluateShippingRequirement(lines, method, hasAddress)`** — returns `ok` or which requirement is missing (`method-required`, `address-required`). Digital-only basket is always `ok`.
- **`CheckoutVerdict`** — discriminated union: `ok`, `empty`, `product-unavailable` (with line list), or `insufficient-stock` (with shortfall list).
- **`evaluateCheckout(lines)`** — the main gate. Checks in order: empty → all-unavailable → stock/availability shortfalls → `ok`. Collects **all** offending lines, not just the first.

## Relationships

- **`domain/availability.ts`** — provides `isBuyable` and `lineAvailability`, the shared availability predicates this file calls per line. The cart view and merge logic use the same predicates, keeping the definition in one place.
- **`domain/index.ts`** — barrel re-export of this module's public API.
- **`services/checkout.ts`** — calls `evaluateCheckout` and `evaluateShippingRequirement`; maps the returned verdict reasons to HTTP status codes and i18n messages.
- **`services/view.ts`** — `readCartLines` performs the product join that produces the `CartLineCandidate` shape (including the `product: null` case for hard-deleted items).
- **`services/items.ts`** — consumes `basketWeight` / `needsShipping` for item-level operations.
- **`tests/unit/domain-rules.test.ts`** and **`tests/unit/stock-rule.test.ts`** — unit tests covering the verdict logic and stock-specific paths.
- **`types/index.ts`** — source of the `LineAvailability` type used in `CheckoutShortfall.availability`.

## Notes

- **Caller computes `available`.** The domain layer deliberately does not import the products module to fetch stock; the caller supplies `product.available`. Absent reads as 0 ("nothing to sell" is the safe refusal direction).
- **`product: null` ≠ soft delete.** Only a hard delete (join miss) yields `null`. Soft-deleted or deactivated products still resolve in the join and are distinguished by `active` / `deletedAt`.
- **`requiresShipping` absent = shipped.** Matches the schema default; fixtures and legacy rows that never set it are treated as physical.
- **Pre-flight, not concurrent.** `evaluateCheckout` compares against *availability* (promised units already subtracted). It does not replace the inventory module's conditional-reserve re-check that runs inside the write transaction.
- **Not shared with orders.** `evaluateCheckout` mirrors `orders`' `checkOrderLines` but is intentionally a separate implementation: a cart is a draft, an order a commitment.
- **Refusal reasons are string literals** (`'empty'`, `'product-unavailable'`, `'insufficient-stock'`) so analytics events can report them verbatim.
- **All offending lines are returned**, not just the first, to avoid the customer binary-searching a multi-line basket.
