# src/modules/orders/domain/totals.ts

## Purpose

Single source of truth for "what does this order cost." Sums priced line items and adds the frozen shipping cost so that the cart preview, the order aggregate, the payment intent, and the confirmation email all derive the same number from one function rather than each re-deriving it.

## Key elements

- **`LineItem`** — intentionally loose interface (`quantity?: unknown`, `product?: { price?: unknown } | null`) to accept both raw aggregate output and cart DTOs without a coercion layer.
- **`LineItemTotals`** — the shape `sumLineItems` returns: `count` (lines), `quantity` (units), `price` (decimal amount).
- **`sumLineItems(items)`** — iterates lines, accumulates quantity and `price × quantity` via `money.ts` primitives. Returns a `LineItemTotals`.
- **`OrderTotalInput`** — `{ items, shippingCost? }`; `shippingCost` is `unknown` and optional (no delivery method → no charge).
- **`orderTotal(input)`** — composes `sumLineItems` + `shippingCost` into the final decimal amount the contract publishes.

## Relationships

- **`money.ts`** — sole arithmetic dependency. All addition, scaling, unit conversion, and the `NO_MONEY` sentinel come from there; this file only composes.
- **`domain/index.ts`** — barrel that re-exports these symbols so `cart`, `payments`, and `orders` import through one path.
- **`cart/services/checkout.ts`** and **`cart/services/view.ts`** — call `orderTotal` / `sumLineItems` to render the cart summary and the checkout preview.
- **`payments/service.ts`** — calls `orderTotal` to set the frozen amount on the payment intent.
- **`orders/emails.ts`** — calls `orderTotal` so the confirmation email states the same figure.
- **`orders/model.ts`** — upstream producer of the raw aggregate data shaped into `LineItem` / `OrderTotalInput`.
- **`tests/unit/totals.property.test.ts`** — property-based tests exercising `sumLineItems` edge cases.
- **`tests/unit/emails.test.ts`** — asserts the email path uses the same totals output.

## Notes

- Nothing here rounds; rounding (or its absence) is owned by `money.ts`. The file docstring is explicit: "Nothing here rounds, because there is nothing to round."
- `count` is `items.length` regardless of whether a line's product failed to populate; `quantity` and `price` simply skip that line's contribution (zero, not `NaN`).
- `LineItem` fields are `unknown`/`null`-tolerant on purpose — do not tighten the types without checking every caller that passes raw aggregate output.
- The file is declared `@module` (no default export); consumers import named symbols via the barrel.
