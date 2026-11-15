---
source: src/modules/orders/domain/totals.ts
sha256: 920f41df31053064514ec7ceede40a6b3fd5866805178c247ea75464370b8ded
generated_at: 2026-11-14T20:35:50.808990+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/domain/totals.ts

## Purpose

Pure arithmetic for "what does this set of priced lines add up to, and what is the grand total including shipping?" All money math runs in minor units via `money.ts` primitives and is converted to decimal text once at the boundary. The file exists so that cart previews, order totals, payment intents, and confirmation emails all derive the same number from one implementation instead of summing independently.

## Key elements

- **`LineItem`** — minimal structural type for a priced line. Fields are `unknown`/nullable because the caller may be passing raw aggregate output or a cart DTO; no shape contract is enforced beyond `product?.price` and `quantity`.
- **`LineItemTotals`** — `{ count, quantity, price }` returned by `sumLineItems`. `count` is the number of lines as given; `quantity` is the sum of whole units; `price` is a decimal string.
- **`lineGross(item, currency): Money`** — single line's gross price in minor units (`price × quantity`). Documented as the one canonical spelling of "what this line costs," reused by the VAT breakdown so totals and tax cannot round apart.
- **`sumLineItems(items, currency): LineItemTotals`** — iterates lines, accumulates quantity via `wholeCount` and price via `addMoney` + `lineGross`. Junk quantities or unpopulated products contribute zero rather than `NaN`.
- **`OrderTotalInput`** — `{ items, shippingCost?, currency }`. `shippingCost` is `unknown` and optional (no delivery method → nothing owed). `currency` is the ISO-4217 code frozen on the order, or the shop's current code for a cart preview.
- **`orderTotal(input): string`** — composes line subtotal + shipping into the grand total as decimal text. The single number the order, its payment intent, and its confirmation email all publish.

## Relationships

- **`src/domain-primitives/money.ts`** — imported for every primitive (`addMoney`, `scaleMoney`, `toDecimalString`, `toMinorUnits`, `wholeCount`, `Money`, `NO_MONEY`). All rounding/flooring logic lives there; this file never rounds.
- **`src/modules/orders/domain/tax.ts`** — consumes `lineGross` for the VAT breakdown so the per-line gross in tax and in totals are identical by construction.
- **`src/modules/orders/domain/index.ts`** — barrel export; cart and payment modules import totals through this re-export rather than reaching into the file directly.
- **`src/modules/cart/services/checkout.ts` / `view.ts`** — read `sumLineItems` / `orderTotal` to render the cart summary and the checkout preview, guaranteeing the preview matches the order it will create.
- **`src/modules/payments/services/intent.ts`** — reads `orderTotal` when freezing a payment intent so the charged amount equals the order total.
- **`src/modules/orders/emails.ts`** — renders the customer-facing confirmation email using the same `orderTotal` string.
- **`src/modules/orders/model.ts`** — source of the raw `LineItem[]` and `shippingCost` values that feed into the functions here.
- **`src/modules/orders/tests/unit/totals.property.test.ts`** — property-based tests exercising `sumLineItems` and `orderTotal` across generated inputs.

## Notes

- `quantity` on `LineItem` is typed `unknown`, not `number`. `wholeCount` coerces it (clamps negatives, floors, rejects NaN). Do not add type narrowing at the call site expecting a number.
- `count` ≠ `quantity`. A line with `quantity: 0` still increments `count` but contributes nothing to `quantity` or `price`.
- `orderTotal` calls `toMinorUnits` on the already-decimal `sumLineItems` result. This is intentional re-hydration back into minor units before adding shipping, then converting out again — it keeps the addition in `money.ts`'s domain.
- There is no rounding in this file. If a total looks "off," the rounding decision was made inside `money.ts` based on the `currency` parameter passed in.
