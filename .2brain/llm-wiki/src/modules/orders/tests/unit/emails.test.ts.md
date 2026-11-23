---
source: src/modules/orders/tests/unit/emails.test.ts
generated_at: 2026-11-22T06:35:38.184605+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/orders/tests/unit/emails.test.ts

## Purpose
Unit tests for the order email builders in `@modules/orders/emails`. They check that the confirmation email shows money, item lines, dates and links correctly, since a formatting slip there reads as a billing error. The tests also check that the builder defers to `orderTotal` and does not recompute the total. The invoice document is out of scope and is tested in `src/modules/invoicing/tests/unit/emails.test.ts`.

## Key elements
- **Fixtures**: `NAME`, `ORDER_ID`, and `ORDER`. `ORDER` has two lines with distinct titles, quantities and prices, plus a `shippingCost` of `4.25` in EUR, so no field can stand in for another.
- **`describe('orderConfirmEmail')`** covers:
  - the template name `orders.order-confirm`;
  - one rendered line per item, with each item's own title, quantity and price (`€100.00`, `€7.50`);
  - delivery promises per line: preorder ("ships from <date>"), dated backorder ("N to arrive by <date>"), undated backorder ("N to arrive within 30 days"), and no promise for a ready line;
  - a date entered at local midnight in Rome (`2026-12-19T23:00Z`) printing as the 20th, not the 19th;
  - `data.total` containing `€226.75` and matching `orderTotal(ORDER)`, with shipping included;
  - Italian money formatting (`226,75\u00A0€`);
  - the greeting containing the name, with no unresolved `{{`;
  - an empty order giving `lines: []`;
  - the locale being passed through and the subject being translated (`en` and `it` differ);
  - every copy slot being resolved rather than left as an `orders.*` key;
  - `data.linkUrl` equal to `orderFrontendLink({ locale, id })`;
  - a line title that collides with a translation key (`orders.email-confirm.greeting`) surviving verbatim, which shows the title is never passed through `t()`;
  - the wording "awaiting payment" and never "confirmed", because the order is still `pending`.
- **`describe('orderCanceledEmail')`**: uses `PAID` and `UNPAID` variants of `ORDER` and a `TOTAL` formatted with `Intl.NumberFormat`. Checks that:
  - the template is `orders.order-canceled` and the body contains the order reference;
  - a refund note states the returned total when the cancel refunds;
  - the note says "No refund" for a paid order canceled without a refund;
  - the note says "nothing was charged" for an unpaid order, whatever the refund flag.

  The visible content ends partway through this block.

## Relationships
- `src/modules/orders/emails.ts`: the code under test (`orderConfirmEmail`, `orderCanceledEmail`, `holdExpiredEmail`, and the `OrderLines` type).
- `src/modules/orders/domain/index.ts`: supplies `orderTotal`, used as the reference value the email total must match.
- `src/modules/orders/config.ts`: supplies `orderFrontendLink`, used to compute the expected `linkUrl`.
- `src/modules/orders/domain/totals.ts`: not imported directly. `orderTotal` is imported from `domain/index.ts`, and this file only asserts that the builder uses it rather than testing its arithmetic.

## Notes
- Assertions on dates, money, and `linkUrl` depend on the shop's timezone (Rome) and on `Intl` output, including the non-breaking space in Italian currency.
- Link construction itself is tested in `src/modules/orders/tests/unit/config.test.ts` and `tests/unit/infrastructure/http/frontend-link.test.ts`. This file only checks that the builder passes the order id and locale through.
- `holdExpiredEmail` is imported, but no test for it is visible in the shown content.
