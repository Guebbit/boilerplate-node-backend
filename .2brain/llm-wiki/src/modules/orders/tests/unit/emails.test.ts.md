---
source: src/modules/orders/tests/unit/emails.test.ts
sha256: c300aa2c3837b83d782a40a1ff2d5202fbb8c9dc87960b05c2dc2304211c156d
generated_at: 2026-10-29T04:58:51.220627+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/unit/emails.test.ts

## Purpose
Unit tests for the order email builders in `@modules/orders/emails` (`orderConfirmEmail`, `orderCancelledEmail`, `cardHoldExpiredEmail`). Verifies that rendered email content—line items, totals, locale formatting, links, and payment-status language—is correct and internally consistent with the order's own computed values.

## Key elements
- **`ORDER`** — shared fixture: two items (quantities 2 and 3, prices €100 and €7.50), €4.25 shipping, EUR currency. Chosen so no field can be substituted for another.
- **`describe('orderConfirmEmail')`** — asserts template name, per-line item rendering (title, qty, price), preorder/backorder shipping promises, locale-aware money formatting (incl. U+00A0), delegation to `orderTotal`, greeting interpolation, empty-order safety, locale passthrough, link URL, the "awaiting payment" (never "confirmed") business rule, and that product titles are interpolated verbatim (never passed through `t()`).
- **`describe('orderCancelledEmail')`** — asserts template name, order-reference inclusion, refund wording (paid + refund, paid no-refund, unpaid), and locale translation.
- **`cardHoldExpiredEmail`** — imported and tested (content truncated in the snippet).

## Relationships
- **`src/modules/orders/emails.ts`** — the module under test; all three builder functions and the `OrderLines` type are imported from here.
- **`src/modules/orders/domain/index.ts`** — source of `orderTotal`; tests assert the email builder defers to it rather than recomputing, so email and charge cannot drift.
- **`src/modules/orders/domain/totals.ts`** — where `orderTotal` is implemented; its correctness is covered separately by `totals.property.test.ts` (referenced in the file's doc-comment).
- **`src/modules/orders/config.ts`** — source of `orderFrontendLink`; tests verify the builder passes the order's id and locale through unchanged to produce the link URL.

## Notes
- **Totals are never recomputed here.** The test asserts `orderTotal(ORDER)` equals the email's displayed total; the arithmetic correctness lives in the property tests.
- **Product titles are frozen snapshots.** The "colliding title" test (`'orders.email-confirm.greeting'` as a literal title) is a sharp regression guard: if the builder ever wraps titles in `t()`, the key would resolve to a different string and the test would fail.
- **Date rendering is timezone-sensitive.** A `2026-12-19T23:00:00Z` timestamp must render as "December 20" (local Rome, UTC+1), not the UTC date.
- **Payment language is a business rule (SH2=C).** At the moment this email is sent the order is still `pending`; the copy must say "awaiting payment," never "confirmed."
- **Empty orders must not throw.** An admin-created order with zero items is reachable; a builder that indexed `items[0]` would crash outside a test.
