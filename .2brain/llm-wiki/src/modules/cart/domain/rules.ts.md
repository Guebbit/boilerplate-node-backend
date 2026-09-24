---
source: src/modules/cart/domain/rules.ts
sha256: ead568b66a0d4e3937df6ab74f09ca29be895d45d97525ba70200190d3e31a10
generated_at: 2026-09-23T18:30:13.395014+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/domain/rules.ts

## Purpose

Pure decision logic for the cart: given cart lines already joined to their products, it answers two questions — _can this cart check out?_ and _how much does it weigh?_ — returning structured verdicts with no status codes, i18n, or side effects. The service layer (`services/checkout.ts`) maps those verdicts into HTTP responses.

## Key elements

- **`CartLineCandidate`** — shape of a joined cart line as the rules consume it; `product: null` signals a hard-deleted product.
- **`UnavailableCartLine`** / **`CheckoutShortfall`** — per-line detail payloads returned inside a refusal verdict.
- **`availableUnits`** _(private)_ — `max(0, onHand − reserved)`. Deliberately duplicates `inventory`'s `availabilityOf` because the domain layer may not import a sibling module.
- **`WeighedCartLine`** — minimal `{ quantity, product: { weight, requiresShipping } }` shape for weight math.
- **`basketWeight(lines)`** — sums `weight × quantity` over shippable lines only (`requiresShipping === false` is skipped); returns grams.
- **`CheckoutVerdict`** — discriminated union: `ok: true` or `ok: false` with reason `'empty'`, `'product-unavailable'`, or `'insufficient-stock'`.
- **`evaluateCheckout(lines)`** — main entry point; checks empty → unavailable (null / inactive / soft-deleted) → insufficient stock, returning **all** offending lines in each case.

## Relationships

- **`src/modules/cart/domain/index.ts`** — barrel file; re-exports the public types and functions defined here.
- **`src/modules/cart/services/checkout.ts`** — consumes `evaluateCheckout` and `basketWeight`; maps verdict reasons to HTTP status codes and i18n strings; uses `basketWeight` both to filter `GET /delivery/methods` (advisory) and to enforce a chosen method's weight limit (blocking).
- **`src/modules/cart/tests/unit/domain-rules.test.ts`** — unit-tests every export here; also asserts that `availableUnits` agrees with `inventory`'s `availabilityOf`.

## Notes

- **Two "unavailable" cases, one filter:** `product === null` (hard delete — `populate()` cannot follow the reference) vs. `product.active === false` / `product.deletedAt` set (soft-deleted / deactivated). The filter covers both in one pass.
- **All lines, not just the first:** both the unavailable and shortfall arrays include every offending line so the caller can tell the user exactly what to fix in one response.
- **Pre-flight only:** this check compares against _availability_ (onHand − reserved) and runs before the write. The concurrency-safe guarantee lives in `inventory`'s conditional reserve, which re-checks the same arithmetic inside the transaction. This module does not excuse or replace that.
- **`requiresShipping` absent → treated as `true`** (shipped), matching the schema default and older rows that never set the column.
- **`availableUnits` duplication is intentional and tested:** `domain-rules.test.ts` pins the two implementations together; `inventory` is the authority.
