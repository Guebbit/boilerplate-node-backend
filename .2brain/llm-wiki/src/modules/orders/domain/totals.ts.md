---
source: src/modules/orders/domain/totals.ts
sha256: 9fb425897c6e03b87d4314c884e53951a0a7f534ce1ec56cc9252dc2b8bae539
generated_at: 2026-10-29T04:41:15.545208+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/domain/totals.ts

## Purpose

Computes what a list of priced line items adds up to and what the customer owes on top (frozen shipping). Exists as the single composition point so that a cart summary, the order it previews, the payment intent, and the confirmation email all derive the same number rather than each summing independently. All arithmetic delegates to `money.ts` in minor units; this file only composes.

## Key elements

- **`LineItem`** — Loose input shape (`quantity?: unknown`, `product?: { price?: unknown } | null`). Accepts both raw aggregate output and cart DTOs; `unknown`/`null` fields are absorbed downstream.
- **`LineItemTotals`** — Return record: `count` (line count), `quantity` (sum of whole units), `price` (combined amount as decimal).
- **`lineGross(item, currency): Money`** — One line's gross in minor units (`price × quantity`). The canonical "what this line costs" used by both totals and the VAT breakdown.
- **`sumLineItems(items, currency): LineItemTotals`** — Folds `lineGross` over a list; junk quantities/products contribute zero rather than `NaN`.
- **`OrderTotalInput`** — `{ items, shippingCost?, currency }` for the grand-total call.
- **`orderTotal(input): number`** — Grand total = `sumLineItems` + frozen shipping, returned as a decimal amount.

## Relationships

- **`src/domain-primitives/money.ts`** — Source of every primitive used here (`addMoney`, `scaleMoney`, `toMinorUnits`, `toDecimalAmount`, `wholeCount`, `Money`, `NO_MONEY`). Owns all rounding; this file never rounds.
- **`src/modules/orders/domain/index.ts`** — Barrel that re-exports these functions; `cart` and `payments` import totals through it rather than reaching into this file directly.
- **`src/modules/orders/domain/tax.ts`** — Consumes `lineGross` so the VAT breakdown and the gross total cannot round apart.
- **`src/modules/cart/services/checkout.ts`** / **`view.ts`** — Read totals via the barrel for the cart summary and the checkout preview.
- **`src/modules/payments/services/intent.ts`** / **`offline.ts`** — Read `orderTotal` so the frozen payment intent matches the order.
- **`src/modules/orders/emails.ts`** / **`src/modules/payments/emails.ts`** — Render the same `orderTotal` in customer-facing mail.
- **`src/modules/invoicing/services/issue-invoice.ts`** / **`issue-credit-note.ts`** — Derive invoice and credit-note amounts from the same totals.
- **`src/modules/orders/tests/unit/totals.property.test.ts`** — Property-based tests for this module's invariants.
- **`src/modules/delivery/tests/unit/money-reconciliation.property.test.ts`** — Cross-checks that shipping + line totals reconcile end-to-end.

## Notes

- **`count` ≠ `quantity`.** `count` is `items.length` (lines as given); a line whose product failed to populate still increments `count` but contributes 0 to `quantity` and `price`.
- **No rounding lives here.** If a rounding bug appears in a total, look in `money.ts`, not this file.
- **`lineGross` is intentionally the only place `price × quantity` is spelled out.** Adding a second multiplication site (even in a test helper) will let totals and tax drift.
- **`currency` is always a required argument** to every exported function; it determines the rounding scale inside `money.ts`. A missing or wrong currency is a caller bug, not a default-away situation.
