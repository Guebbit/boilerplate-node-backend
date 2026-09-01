# src/modules/cart/domain/rules.ts

## Purpose

Pure decision logic that determines whether a cart can proceed to checkout. It accepts already-joined cart lines and returns a typed verdict (pass / named refusal reason), with no side effects, no status codes, and no i18n — those concerns belong to the service layer.

## Key elements

- **`CartLineCandidate`** — the shape of a single cart line as the rules see it. `product` is `| null` (null means the product was deleted after the line was written).
- **`CheckoutShortfall`** — one line that is over-allocated, carrying `productId`, `title`, `requested`, and `available` so the UI can name the specific problem.
- **`availableUnits`** (private) — computes `max(0, onHand − reserved)`. Deliberately duplicates `inventory`'s `availabilityOf` because the domain layer cannot import a sibling module.
- **`CheckoutVerdict`** — discriminated union: `{ ok: true }` or `{ ok: false, reason: 'empty' | 'product-unavailable' | 'insufficient-stock', shortfalls? }`. Reasons are stable strings consumed verbatim by analytics.
- **`evaluateCheckout(lines)`** — the sole entry point. Checks in order: empty cart → any line whose product is missing/null → any line whose quantity exceeds available units. Returns **all** shortfalls, not just the first.

## Relationships

- **`src/modules/cart/domain/index.ts`** — barrel re-export; consumers import `evaluateCheckout` and the types through the domain index rather than this file directly.
- **`src/modules/cart/services/checkout.ts`** — caller. Invokes `evaluateCheckout`, then maps the verdict's `reason`/`shortfalls` to HTTP status codes, i18n messages, and response bodies.
- **`src/modules/cart/tests/unit/domain-rules.test.ts`** — unit tests. Among other things, asserts that this file's `availableUnits` produces the same numbers as `inventory`'s `availabilityOf` (inventory is the authority).

## Notes

- **Pre-flight only.** This check does not guarantee the invariant under concurrency. The authoritative guard is `inventory`'s conditional reserve, which re-evaluates the same stock rule inside the write transaction. This file does not replace or excuse that.
- **Availability, not on-hand.** A product with 40 units all reserved reports `availableUnits = 0` and is treated as unsellable.
- **Deliberate duplication of `availableUnits`.** Do not "fix" this by importing from `inventory`; the domain layer is isolated by design. Keep the two implementations in sync via the test.
- **Deliberate non-sharing with `orders`.** `evaluateCheckout` mirrors `orders`' `checkOrderLines` but is intentionally a separate function (cart = draft, order = commitment).
- **All shortfalls are returned.** Do not truncate to the first mismatch — the UI relies on the full list to let the customer fix every problem in one pass.
