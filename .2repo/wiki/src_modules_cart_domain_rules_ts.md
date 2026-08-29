# src/modules/cart/domain/rules.ts

## Purpose
Pure, side-effect-free validation rules that decide whether a cart may proceed to checkout. It takes already-joined cart lines in and returns a named verdict out—no status codes, no i18n, no I/O. It exists to keep the "can this cart become an order?" question in the domain layer, where it can be tested in isolation and mirrored (but not shared) by the orders domain.

## Key elements
- **`CartLineCandidate`** — The minimal shape of a cart line the rules consume. `product` is `null` when `populate()` has already dropped a deleted product; counters default to 0 for safe refusal.
- **`CheckoutShortfall`** — Describes one un-checkable line (productId, title, requested vs. available units) so the UI can name *which* lines are short, not just that *something* is.
- **`availableUnits`** (module-private) — `Math.max(0, onHand − reserved)`. A deliberate second copy of `inventory`'s `availabilityOf` to keep the domain free of sibling-module imports.
- **`CheckoutVerdict`** — Discriminated union: `{ ok: true }` or `{ ok: false; reason: 'empty' | 'product-unavailable' | 'insufficient-stock'; shortfalls? }`.
- **`evaluateCheckout(lines)`** — The sole public function. Walks all lines and returns the *first* failing class (empty → product-unavailable → insufficient-stock). For stock, it collects **every** shortfall line, not just the first, so the caller can surface the full list in one round trip.

## Relationships
- **`domain/index.ts`** — Re-exports the public symbols (`evaluateCheckout`, the interfaces, the verdict type) as the cart domain's public surface.
- **`services/checkout.ts`** — Consumes `evaluateCheckout`, maps the verdict to HTTP status codes / i18n messages, and is the only place that knows how to *present* a refusal.
- **`tests/unit/domain-rules.test.ts`** — Unit-tests the rules directly; also asserts that `availableUnits` here agrees with `inventory`'s `availabilityOf` to prevent silent drift between the two copies.

## Notes
- **Availability ≠ on-hand.** The rule compares requested quantity against `onHand − reserved`. A product with 40 units on hand but 40 reserved has **zero** available.
- **Pre-flight, not concurrency guard.** This check runs before the transaction. The concurrency-safe half is `inventory`'s conditional reserve, which re-checks the same arithmetic inside the write. This file does *not* replace that.
- **Deliberate duplication.** `availableUnits` intentionally mirrors `inventory`'s `availabilityOf` because the domain layer is forbidden from importing sibling modules. The unit test is the only drift guard.
- **Named reasons, not codes.** `reason` is a plain string reported verbatim in the checkout-failure analytics event—do not convert to an enum or numeric code without updating downstream reporting.
- **Unshared by design.** `evaluateCheckout` mirrors `orders`' `checkOrderLines` but is kept separate: a cart is a draft, an order a commitment, and the two can evolve independently.
