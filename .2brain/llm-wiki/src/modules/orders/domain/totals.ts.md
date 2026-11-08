---
source: src/modules/orders/domain/totals.ts
sha256: bec62d5aade1b6694b24d7e5d2166aeb6a532bf5455b0b269ef1391a822cbb30
generated_at: 2026-11-08T06:50:55.760515+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/domain/totals.ts

## Purpose

Pure arithmetic for "what does this set of priced lines add up to, and what does the customer owe on top?" It exists as a single shared source of truth so that a cart preview, the order it becomes, the frozen payment intent, and the confirmation email all agree on the same number without any of them summing independently. All rounding is delegated to `money.ts`; this module only composes.

## Key elements

- **`LineItem`** – Minimal structural type for a priced line (`quantity?: unknown`, `product?: { price?: unknown } | null`). Accepts both raw aggregate output and cart DTOs without casting.
- **`LineItemTotals`** – Return shape of `sumLineItems`: line `count`, total `quantity` (whole units), and total `price` (decimal string).
- **`lineGross(item, currency): Money`** – One line's gross in minor units (`price × quantity`). Exported so the VAT breakdown (`tax.ts`) uses the identical computation and cannot round apart from the totals.
- **`sumLineItems(items, currency): LineItemTotals`** – Iterates lines, accumulating quantity and gross price via `addMoney`. Junk quantities or unpopulated products contribute zero rather than `NaN`.
- **`OrderTotalInput`** – `{ items, shippingCost?, currency }`. `shippingCost` is `unknown` (raw aggregate) and optional (no delivery method = nothing owed).
- **`orderTotal(order): string`** – Grand total = `sumLineItems` + frozen `shippingCost`, returned as the decimal text the public contract publishes.

## Relationships

- **`@domain-primitives/money`** — Sole arithmetic dependency. All additions, scaling, unit conversions, and decimal-string formatting go through `addMoney`, `scaleMoney`, `toMinorUnits`, `toDecimalString`, `wholeCount`, `NO_MONEY`.
- **`src/modules/orders/domain/index.ts`** — Barrel that re-exports this module so `cart` and `payments` import totals without reaching into the `orders` domain directly.
- **`src/modules/orders/domain/tax.ts`** — Imports `lineGross` so the VAT breakdown and the line totals are computed from the same expression.
- **`src/modules/orders/model.ts`** — The order aggregate whose raw output shapes match `LineItem`; this file reads it without requiring the model to import `totals`.
- **`src/modules/cart/services/checkout.ts` / `view.ts`** — Call `orderTotal` (via the barrel) to render the cart summary and to freeze the total at checkout.
- **`src/modules/payments/services/intent.ts` / `offline.ts`** — Read the same `orderTotal` result to build the frozen payment intent; never re-sum.
- **`src/modules/orders/emails.ts` / `src/modules/payments/emails.ts`** — Embed the `orderTotal` string in confirmation/receipt emails.
- **`src/modules/invoicing/services/issue-invoice.ts` / `issue-credit-note.ts`** — Consume the order total as the invoice line amount.
- **`src/modules/orders/tests/unit/totals.property.test.ts`** — Property-based tests pinning the invariants (junk tolerance, count-vs-quantity distinction, no `NaN`).
- **`src/modules/delivery/tests/unit/money-reconciliation.property.test.ts`** — Cross-checks that the delivery shipping cost fed into `OrderTotalInput` reconciles with the grand total.

## Notes

- **No rounding lives here.** `money.ts` owns every rounding decision; `totals.ts` only adds and scales. Adding a `Math.round` call in this file would break the invariant that the VAT breakdown and the total agree to the last minor unit.
- **`unknown` is intentional.** `quantity`, `product.price`, and `shippingCost` are typed `unknown` because they arrive as raw aggregate or DTO output. The `toMinorUnits` / `wholeCount` helpers absorb malformed values as zero rather than throwing—this is a deliberate fault-tolerance choice, not a type-safety gap.
- **`count` ≠ `quantity`.** `count` is `items.length` (lines as given, including dropped/empty ones); `quantity` is the sum of whole units. Do not conflate them in display logic.
- **`lineGross` is the single spelling of "what this line costs."** If you need a per-line amount for any other purpose (refunds, partial VAT), call `lineGross` rather than re-multiplying, to preserve the round-apart guarantee with `tax.ts`.
