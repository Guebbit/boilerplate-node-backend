---
source: src/modules/orders/domain/totals.ts
sha256: 95c43212deb75ff8ae09a5eeecd1ac7065eeb5c3a12c2edbbee31efee8beeccf
generated_at: 2026-10-15T11:03:17.550064+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/domain/totals.ts

## Purpose

Pure arithmetic for order totals: sums a list of priced line items (count, quantity, price) and composes that with a frozen shipping cost to produce the grand total the customer owes. It exists as a single source of truth so that the cart preview, the order, the payment intent, and every downstream email/invoice all agree on the same number without re-deriving it.

## Key elements

- **`LineItem`** — Loose input shape (`unknown` fields) that accepts both raw aggregate output and cart DTOs without a shared type.
- **`LineItemTotals`** — Return type of `sumLineItems`: `count` (line count), `quantity` (total units), `price` (decimal amount).
- **`sumLineItems(items, currency)`** — Iterates line items, defensively converts each quantity/price via `wholeCount`/`toMinorUnits` (null or unpopulated products contribute zero, not `NaN`), accumulates in minor units, and returns a `LineItemTotals`.
- **`OrderTotalInput`** — Describes an order's totals inputs: `items`, optional `shippingCost`, and `currency`.
- **`orderTotal(input)`** — Composes `sumLineItems` + frozen `shippingCost` in minor units, returns the grand total as a decimal amount.

## Relationships

- **`src/modules/orders/domain/index.ts`** — Barrel re-export; this is how `cart` and `payments` modules import these functions without reaching into `orders/domain` directly.
- **`src/modules/cart/services/checkout.ts`** and **`src/modules/cart/services/view.ts`** — Call `sumLineItems`/`orderTotal` via the barrel to render cart summaries and checkout previews.
- **`src/modules/payments/services/intent.ts`** — Calls `orderTotal` to freeze the amount on the payment intent.
- **`src/modules/payments/services/offline.ts`** — Consumes the total for offline payment processing.
- **`src/modules/orders/model.ts`** — Produces the raw aggregate output that feeds the `LineItem` shape (hence the `unknown` fields).
- **`src/modules/orders/emails.ts`** and **`src/modules/payments/emails.ts`** — Read the total to render confirmation/payment emails.
- **`src/modules/invoicing/services/issue-invoice.ts`** and **`issue-credit-note.ts`** — Use the total for invoice/credit-note amounts.
- **`src/modules/returns/services/create.ts`** and **`receive.ts`** — Read the total when processing returns.
- **`src/modules/orders/tests/unit/totals.property.test.ts`** — Property-based tests exercising `sumLineItems` and `orderTotal`.

## Notes

- All arithmetic stays in **minor units** internally; conversion to the decimal amount happens exactly once at the return boundary via `toDecimalAmount`. No rounding occurs here—`money.ts` owns that concern.
- `LineItem` fields are typed `unknown` deliberately: callers pass either raw aggregate output or DTOs, and `wholeCount`/`toMinorUnits` absorb `null`/`undefined`/non-numeric values by treating them as zero. A missing product on a line does **not** produce `NaN`.
- `count` in `LineItemTotals` is the number of lines *as given* (array length), not the number of valid-priced lines. A line with a null product still increments `count`.
- The `currency` parameter is required on every call; it determines the rounding scale applied by the `@shared-kernel/money` helpers. For an unfinalized cart this is the shop's current currency; for a confirmed order it is the order's own frozen currency.
