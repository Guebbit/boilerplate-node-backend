# src/modules/orders/domain/totals.ts

## Purpose

Pure arithmetic for order pricing: given a list of priced line items (and an optional frozen shipping cost), it produces the count, total quantity, and grand total that the customer owes. It exists as a single source of truth so that the order aggregate, the cart summary, and the payment intent all report the same numbers without each reimplementing the sum.

## Key elements

- **`LineItem`** – Minimal, loose shape for one priced line (`quantity`, `product?.price`). Fields are `unknown`-typed because callers pass raw aggregate output or DTOs without a shared contract.
- **`LineItemTotals`** – `{ count, quantity, price }`. `count` = number of lines; `quantity` = sum of whole units; `price` = sum of `price × quantity` as a decimal amount.
- **`sumLineItems(items)`** – Iterates lines, accumulates quantity and price via `money.ts` helpers (`wholeCount`, `toMinorUnits`, `scaleMoney`, `addMoney`). Returns a `LineItemTotals`.
- **`OrderTotalInput`** – `{ items, shippingCost? }`. `shippingCost` is `unknown` and optional (no delivery → no charge).
- **`orderTotal(input)`** – Adds the line-item price and the frozen shipping cost, returning the final decimal amount the customer owes.
- All arithmetic delegates to `./money` (`NO_MONEY`, `addMoney`, `scaleMoney`, `toMinorUnits`, `toDecimalAmount`, `wholeCount`). This file performs **no rounding**.

## Relationships

- **`src/modules/orders/domain/money.ts`** – Provides every arithmetic primitive; this file is a composition layer above it.
- **`src/modules/orders/domain/index.ts`** – Barrel export; consumers (cart, payments, emails) import through it.
- **`src/modules/cart/services/checkout.ts` / `view.ts`** – Read `LineItemTotals` / `orderTotal` to build `CartSummary` fields (`itemsCount`, `totalQuantity`, `total`).
- **`src/modules/payments/service.ts`** – Calls `orderTotal` to freeze the amount on the payment intent.
- **`src/modules/orders/emails.ts`** – Calls `orderTotal` for the confirmation email line.
- **`src/modules/orders/model.ts`** – The order aggregate carries `totalItems`, `totalQuantity`, `totalPrice` (the OpenAPI names mapped in the file header).
- **`src/modules/orders/tests/unit/totals.property.test.ts`** – Property-based tests for `sumLineItems` and `orderTotal`.
- **`docs/theory/tactical-ddd.md`** – Documents the "domain owns the calculation, services read through the barrel" pattern this file exemplifies.

## Notes

- **No rounding here.** `money.ts` owns all rounding/conversion; this file only adds and scales. If you see a rounding bug, fix it in `money.ts`.
- **`count` ≠ `quantity`.** `count` is the number of array entries (lines); a line with `quantity = 0` still increments `count` but not `quantity`.
- **Junk-tolerant by design.** `wholeCount` and `toMinorUnits` coerce `undefined`/`null`/`NaN` to `0`, so an unpopulated product ref contributes nothing rather than poisoning the total.
- **OpenAPI name mapping** (documented in the header comment): `count`→`totalItems`/`itemsCount`, `quantity`→`totalQuantity`, `price`→`totalPrice`/`total`. Do not rename the local fields without updating all three resource schemas.
