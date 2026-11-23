---
source: src/modules/orders/domain/totals.ts
source_sha256: 920f41df31053064514ec7ceede40a6b3fd5866805178c247ea75464370b8ded
context_sha256: bc9210e49635a5d774e4bdeac4bc6a9b6b51b707e6dbdcad7d7abc0227c5383d
generated_at: 2026-11-22T06:13:48.857640+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/orders/domain/totals.ts

## Purpose
Defines how a list of priced lines adds up to an order total, plus shipping. It is the single place that composes the customer's grand total, so the cart summary, the order it previews, the payment intent, and the confirmation email all agree. Arithmetic runs in minor units via `money.ts` and converts to decimal text once on output.

## Key elements
- `LineItem` — loose input type: `quantity?: unknown` and `product?: { price?: unknown } | null`. It accepts raw aggregate output, cart DTOs, and unpopulated refs.
- `LineItemTotals` — result shape of `sumLineItems`: `count` (lines), `quantity` (whole units), `price` (decimal string).
- `lineGross(item, currency)` — one line's gross price in minor units (`product.price × quantity`). The totals and the VAT breakdown share it so they cannot round apart.
- `sumLineItems(items, currency)` — returns the line count, total quantity, and total price as decimal text. Junk quantities or unpopulated products contribute nothing instead of producing `NaN`.
- `OrderTotalInput` — `items`, optional `shippingCost` (unknown, raw), and `currency` (ISO-4217).
- `orderTotal({ items, shippingCost, currency })` — returns the lines plus the frozen shipping cost as a decimal string.

## Relationships
- Imports `addMoney`, `scaleMoney`, `toDecimalString`, `toMinorUnits`, `wholeCount`, `Money` and `NO_MONEY` from `src/domain-primitives/money.ts`. That file owns rounding and conversion. This file owns composition.
- Per the module doc, `cart` and `payments` read it through the `orders/domain` barrel (`index.ts`). The cart services (`checkout.ts`, `view.ts`) and the payments services (`intent.ts`, `offline.ts`) are graph neighbors on that side.
- The doc comments say the order, its payment intent, and its confirmation email must not sum totals independently. The order and payment email modules and `invoicing` services (`figures.ts`, `issue-invoice.ts`) are likewise neighbors.
- `lineGross` is documented as shared with the VAT breakdown, which lives in the neighboring `tax.ts`.
- Tests: `totals.property.test.ts` and `money-reconciliation.property.test.ts` cover the arithmetic. `emails.test.ts` sits alongside the email modules.

## Notes
- `count` is the number of lines as given, so a line whose product failed to populate still counts as a line even though it adds no price or quantity.
- The same `wholeCount(item.quantity)` reading feeds both the `quantity` column and the price scaling, so counted and charged units match.
- `orderTotal` re-parses `sumLineItems(...).price` (a decimal string) back into minor units before adding shipping.
- A missing `shippingCost` means no shipping charge.
- The currency decides the rounding scale. It is the order's frozen currency, or the shop's current one for a cart preview.
