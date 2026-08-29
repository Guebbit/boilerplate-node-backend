# src/modules/orders/tests/unit/emails.test.ts

## Purpose

Unit tests for the order-confirmation email builder and the invoice document builder in `@modules/orders/emails`. The assertions are shaped around specific billing-error failure modes (wrong item fields, total that omits shipping, lines built off the wrong array) and verify that the builder delegates to `orderTotal` rather than recomputing a divergent sum.

## Key elements

- **`ORDER`** (const) — shared fixture: two items with distinct titles/quantities/prices plus a `shippingCost`, so no field can silently stand in for another.
- **`describe('orderConfirmEmail')`** — 8 tests covering: template name, one-line-per-item count, per-line field correctness, total equals `orderTotal(ORDER)` (shipping included), shipping actually changes the total, customer name in greeting, empty-items order produces zero lines, locale pass-through + translated subject, and that all copy slots resolve to real strings (no `orders.*` key leaks).
- **`describe('invoiceDocument')`** — 4 tests covering: one-line-per-item with correct values, order ID appears in `pageMetaTitle`, a non-string ID (object with `toString`) renders without `[object Object]`, and locale pass-through with translated title.

## Relationships

- **`src/modules/orders/emails.ts`** — the module under test; provides `orderConfirmEmail`, `invoiceDocument`, and the `OrderLines` type.
- **`src/modules/orders/domain/index.ts`** — re-exports `orderTotal`, which this file imports to cross-check that the email/invoice builders delegate to the domain total rather than computing their own.
- **`src/modules/orders/domain/totals.ts`** — implements `orderTotal`; its own correctness is covered in `totals.property.test.ts`. This file only asserts the builder *calls* it, not that the math is right.

## Notes

- The doc-comment at the top of the file enumerates the three concrete failure modes the suite guards against; it reads as a spec, not just a comment.
- `orderTotal` correctness is **not** asserted here—only that the builder uses it. Do not add arithmetic checks to this file; they belong in `totals.property.test.ts`.
- The empty-order test exists because an admin-created order can have zero items and a naive `items[0]` access would throw at runtime rather than in a test.
- The non-string ID test (object with `toString`) encodes the invariant that the builder wraps the ID in `String(...)`; dropping that coercion is invisible until a customer receives an invoice titled `[object Object]`.
