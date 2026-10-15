---
source: src/modules/orders/tests/unit/emails.test.ts
sha256: 4d4ba27ea54ba9c13a7dd31019e810d5e167de15ec4b9e2c9a062edb33025553
generated_at: 2026-10-15T11:19:10.361584+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/unit/emails.test.ts

## Purpose

Unit tests for the order **confirmation** and **cancellation** email builders (`orderConfirmEmail`, `orderCancelledEmail`). They verify that the rendered output correctly interpolates order lines, defers total computation to the domain layer, carries locale and link parameters through unchanged, and never re-resolves frozen product titles through the i18n layer. They exist because a formatting slip in a money-facing email is read as a billing error by the least able party to check it.

## Key elements

- **`describe('orderConfirmEmail')`** — 12 assertions covering: template name, one line per item with correct title/qty/price, total delegates to `orderTotal` (shipping included), greeting by name, empty-order safety, locale passthrough, no unresolved i18n keys, correct frontend link, product-title non-re-resolution guard, and "awaiting payment" (never "confirmed") copy.
- **`describe('orderCancelledEmail')`** — 5 assertions covering: template name + order ID in body, refund note shows the paid total when a refund was issued, "No refund" when the operator skipped it, "nothing was charged" for unpaid orders, and locale/i18n hygiene.
- **`ORDER` fixture** — two items with distinct titles, quantities, and prices so no field can silently stand in for another.
- **`PAID` / `UNPAID` / `TOTAL` fixtures** — support the cancellation-email refund-path assertions.

## Relationships

- **`src/modules/orders/emails.ts`** — the module under test; provides `orderConfirmEmail`, `orderCancelledEmail`, and the `OrderLines` type.
- **`src/modules/orders/domain/index.ts`** — exports `orderTotal`; the test asserts the email builder *uses* it rather than recomputing, keeping email and charge from drifting.
- **`src/modules/orders/domain/totals.ts`** — the actual summing logic, covered by its own property-based suite (`totals.property.test.ts`); this file only checks that the builder defers to it.
- **`src/modules/orders/config.ts`** — provides `orderFrontendLink`; the test asserts the builder passes the order's id and locale through to produce the correct link.

## Notes

- The invoice document is **not** this file's concern; it is explicitly delegated to `src/modules/invoicing/tests/unit/emails.test.ts`.
- The "colliding title" test (`orders.email-confirm.greeting`) is the sharpest regression guard against accidentally passing a product title through `t()`.
- The shipping-inclusion test is a two-call comparison: the same order with `shippingCost: 0` must produce a different total string, catching the "email quotes subtotal, card charges delivered total" drift.
- The empty-items test guards against a builder that indexes `items[0]` instead of mapping; it's unreachable through checkout but reachable via admin-created orders.
- The "awaiting payment" assertion enforces the SH2=C state invariant: at confirmation-mail time the order is always `pending`.
