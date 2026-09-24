---
source: src/modules/orders/domain/totals.ts
sha256: d77a94be7d0050fc8f64345a15011fe9294cb3ce34ce9c8f19bacc674f126110
generated_at: 2026-09-23T19:02:20.425708+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/domain/totals.ts

## Purpose

Pure computation of order totals from a list of priced line items (plus optional shipping). It exists so that the cart summary, the order preview, the frozen payment intent, and the confirmation email all derive the same number from a single source rather than each summing independently. All arithmetic is performed in minor units via `money.ts` and converted to a decimal amount exactly once at the boundary.

## Key elements

- **`LineItem`** — Loose input shape for a single priced line (`quantity?: unknown`, `product?.price?: unknown`). Accepts raw aggregate output _and_ cart DTOs without a strict type contract.
- **`LineItemTotals`** — Return shape of `sumLineItems`: `{ count, quantity, price }` (line count, total units, decimal price).
- **`sumLineItems(items: readonly LineItem[]): LineItemTotals`** — Iterates lines, sanitising each via `wholeCount` / `toMinorUnits` so a missing or malformed line contributes zero rather than poisoning the total with `NaN`.
- **`OrderTotalInput`** — `{ items, shippingCost? }`; shipping is `unknown` because it arrives as raw aggregate output and is optional when no delivery method was chosen.
- **`orderTotal(order: OrderTotalInput): number`** — Composes `sumLineItems` price with `shippingCost` in minor units, then returns a single decimal amount. This is _the_ number published to the outside world.

## Relationships

- **`./money.ts`** — Sole internal dependency. Provides `addMoney`, `scaleMoney`, `toMinorUnits`, `toDecimalAmount`, `wholeCount`, `NO_MONEY`. All rounding policy lives there; this file composes but never rounds.
- **`./index.ts`** — Barrel re-export. `cart` and `payments` import from the barrel, never directly from this file.
- **`src/modules/cart/services/checkout.ts` / `view.ts`** — Consumers that call `sumLineItems` / `orderTotal` to build the cart summary and preview.
- **`src/modules/payments/services/intent.ts` / `offline.ts`** — Consumers that read `orderTotal` to set the frozen amount on the payment intent.
- **`src/modules/orders/model.ts`** — Source of the `LineItem`-shaped data (order aggregate lines) passed into these functions.
- **`src/modules/orders/emails.ts`** — Calls `orderTotal` so the confirmation email amount matches the intent.
- **`tests/unit/totals.property.test.ts`** — Property-based tests for `sumLineItems` and `orderTotal`.
- **`tests/cross-cutting/money-reconciliation.property.test.ts`** — Verifies that the total computed here reconciles with the minor-unit math in `money.ts`.

## Notes

- **No rounding here.** The module doc explicitly states "there is nothing to round." If you see rounding logic, it belongs in `money.ts`.
- **Defensive by design.** `wholeCount` and `toMinorUnits` are the junk-absorbers. A line with a `null` product or a string price silently contributes zero. Do not add `!` assertions or throw here.
- **`count` ≠ `quantity`.** `count` is always `items.length` (lines as given); `quantity` is the sum of per-line units. A dropped/zero-quantity line still increments `count`.
- **Single decimal conversion.** `toDecimalAmount` is called exactly once per public function. Intermediate values stay as `Money` (minor units) to avoid floating-point drift.
