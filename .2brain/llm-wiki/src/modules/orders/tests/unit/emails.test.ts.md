---
source: src/modules/orders/tests/unit/emails.test.ts
sha256: a8a8ab0b9b0471789c3ea7dd914d1c720de326d8e317febc9a0dcd1ae709d669
generated_at: 2026-11-14T20:56:52.297666+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/unit/emails.test.ts

## Purpose

Unit tests for the order email builders (`orderConfirmEmail`, `orderCanceledEmail`, and by import `holdExpiredEmail`) in `@modules/orders/emails`. The file exists to pin the rendered copy, line-per-item mapping, locale-aware money formatting, date handling, and payment-status language that a customer receives, so that a formatting regression is caught before it is misread as a billing error.

## Key elements

- **`describe('orderConfirmEmail')`** — the bulk of the file. Verifies template name, per-item line count and content (title, quantity, price), preorder/backorder delivery phrasing, local-date rendering, total (deferred to `orderTotal`), locale money formatting, greeting, empty-order safety, locale passthrough, absence of raw translation keys, link URL, product-title verbatim interpolation (no `t()` re-resolution), and "awaiting payment" (never "confirmed") language.
- **`describe('orderCanceledEmail')`** — verifies template name, order-id echo, refund-note content for paid + refunded, paid + not-refunded, and unpaid orders, plus locale translation.
- **Fixtures `ORDER`, `NAME`, `ORDER_ID`** — a two-line EUR order with distinct titles, quantities, and prices so that field-swap or array-misuse bugs cannot slip through.
- **`PAID` / `UNPAID`** (inside the canceled-email block) — order objects with and without `paidAt`, used to exercise the refund-branch logic.

## Relationships

- **`src/modules/orders/emails.ts`** — the module under test. All three builder functions (`orderConfirmEmail`, `orderCanceledEmail`, `holdExpiredEmail`) and the `OrderLines` type are imported from here.
- **`src/modules/orders/domain/index.ts`** — re-exports `orderTotal`; the tests import it from this barrel and call it directly to compare against the rendered total, confirming the builder delegates rather than recomputes.
- **`src/modules/orders/config.ts`** — provides `orderFrontendLink`; the test asserts the builder's output URL equals the result of calling `orderFrontendLink` with the same locale and order id, pinning the builder's responsibility to pass those values through without re-deriving the URL.
- **`src/modules/orders/domain/totals.ts`** — the implementation behind the `orderTotal` re-exported by `domain/index.ts`. Not imported directly by this file, but the tests depend on its contract (the email total must equal what this function computes for the same order).

## Notes

- The file deliberately does **not** re-test `orderTotal`'s arithmetic; it only asserts that the email builder *calls* `orderTotal` so the email and the charge cannot drift.
- A product title that collides with a real translation key (`orders.email-confirm.greeting`) is used as a canary: if the builder ever regresses to `t(item.product.title)`, the title would be replaced and the test would fail.
- Date assertions encode a UTC-offset trap: a local-midnight date in Rome (UTC+1) must render as the *next* calendar day, not the UTC evening before.
- `holdExpiredEmail` is imported but no `describe` block for it is visible in the provided excerpt; it may be tested in the truncated portion.
