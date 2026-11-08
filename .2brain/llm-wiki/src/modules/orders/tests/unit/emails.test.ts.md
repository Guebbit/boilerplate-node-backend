---
source: src/modules/orders/tests/unit/emails.test.ts
sha256: 84eb5d27bd945e060a309b1a1775398e5a897c716d618639737a1c0c89c51650
generated_at: 2026-11-08T07:11:56.383467+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/unit/emails.test.ts

## Purpose

Unit tests for the order-lifecycle email builders (`orderConfirmEmail`, `orderCanceledEmail`, `cardHoldExpiredEmail`) defined in `@modules/orders/emails`. The focus is on the *rendered output*: correct per-item lines, locale-aware money formatting, proper deferral to `orderTotal` for the total, and that copy slots are resolved (no raw i18n keys leak). It does **not** cover invoice-document emails (those live in `src/modules/invoicing/tests/unit/emails.test.ts`) or the correctness of the sum itself (covered by `totals.property.test.ts`).

## Key elements

- **Shared fixtures** — `NAME`, `ORDER_ID`, and the `ORDER` constant (two distinct items, EUR, `shippingCost: '4.25'`) used across both `describe` blocks.
- **`describe('orderConfirmEmail')`** — the bulk of the file. Asserts:
  - Template name is `orders.order-confirm`.
  - One rendered line per item, each carrying its own title, quantity, and price.
  - Preorder / backordered delivery language (dated vs. undated, "ships from …" vs. "arrive by …" vs. "arrive within 30 days").
  - Date displayed in the *local* shop day, not the UTC evening before (timezone edge-case).
  - Total equals `orderTotal(ORDER)` and includes shipping; rendered via `Intl` per locale (e.g. `226,75\u00A0€` for Italian).
  - Greeting contains the customer's name, no `{{` placeholders.
  - Empty `items` array produces an empty `lines` array without throwing.
  - Locale is carried through; subject differs between `en` and `it`.
  - Every copy slot (subject, pageMetaTitle, body, footer, linkLabel) is non-empty and not a raw key.
  - `linkUrl` equals `orderFrontendLink({ locale, id })`.
  - A product title that collides with a real i18n key is rendered verbatim (no accidental `t()` re-resolution).
  - Copy says "awaiting payment", never "confirmed".
- **`describe('orderCanceledEmail')`** — asserts:
  - Template name `orders.order-canceled`; body contains the order id.
  - Paid + refund → `refundNote` includes the formatted total and "returned".
  - Paid, no refund → "No refund", no total.
  - Unpaid → "nothing was charged" regardless of the refund flag.
  - Locale translation and key-resolution checks (mirrors the confirm block).

## Relationships

- **`src/modules/orders/emails.ts`** — the module under test; exports `orderConfirmEmail`, `orderCanceledEmail`, `cardHoldExpiredEmail`, and the `OrderLines` type consumed here.
- **`src/modules/orders/domain/index.ts`** → **`src/modules/orders/domain/totals.ts`** — provides `orderTotal`, which the tests call directly to assert the builder *uses* the same total (no independent recomputation).
- **`src/modules/orders/config.ts`** — provides `orderFrontendLink`, used to verify the builder passes the correct `{ locale, id }` through to the link without altering it.

## Notes

- The file deliberately does **not** re-test `orderTotal`'s arithmetic; that is the remit of `totals.property.test.ts`. Here it only checks that the email builder's total *matches* the domain function's output.
- `cardHoldExpiredEmail` is imported but its test block is beyond the visible content (truncated); it is expected to follow the same pattern.
- The timezone test relies on the host running with a non-UTC offset (Rome / UTC+1 is the documented scenario). If the CI runner is UTC, the "local midnight" edge still works because the input is set to `23:00Z` and the expected output is the *next* calendar day.
- The "colliding title" test uses `orders.email-confirm.greeting` as a product title — a deliberate trap to catch a future regression where the builder wraps item titles in a translation call.
