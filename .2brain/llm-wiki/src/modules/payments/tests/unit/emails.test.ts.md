---
source: src/modules/payments/tests/unit/emails.test.ts
sha256: 207a0f3f242ee032f628127b6fda4c930fa1d50fcbba7901a15fad3db6f1350a
generated_at: 2026-10-29T05:23:44.341066+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/tests/unit/emails.test.ts

## Purpose

Unit tests for the four payment-email builders in `@modules/payments/emails`. They verify that the generated mail objects carry the correct template name, formatted currency, line-item detail, localization, and links — because a formatting or localization slip in a money-related email reads as a billing error to the recipient.

## Key elements

- **`describe('paymentReceivedEmail')`** — asserts template ID, one line per order item, the order total (including shipping) formatted in the order's own currency, the frontend order link, and that the subject is translated (no raw i18n key leaks).
- **`describe('refundIssuedEmail')`** — asserts template ID, refund number and amount in the body, distinct wording for full vs. partial refund (`isFullRefund` flag), and locale-dependent subject.
- **`describe('the bank transfer mails')`** — covers both `transferInstructionsEmail` and `transferExpiredEmail`. Checks: template IDs, all instruction fields (beneficiary, IBAN, reference, optional BIC, deadline), timezone-aware deadline rendering (CEST / GMT+2), currency-symbol correctness via the JPY fixture, and locale translation for both mails.
- **Fixtures** — `ORDER` (2-item EUR order, deliberately distinct titles/quantities/prices), `YEN` (single JPY item to catch currency-symbol bugs), `INSTRUCTIONS` (IBAN + reference, no BIC), `PAY_BY` (a fixed UTC instant for deadline assertions).
- **`orderTotal`** (imported from `@modules/orders`) — used as an independent oracle to confirm the expected total before asserting it appears in the mail body.

## Relationships

- **`src/modules/payments/emails.ts`** — the module under test; all four builder functions (`paymentReceivedEmail`, `refundIssuedEmail`, `transferInstructionsEmail`, `transferExpiredEmail`) are imported here and exercised.
- **`src/modules/orders/index.ts`** — barrel import providing `orderTotal` (used as a cross-module assertion oracle) and `orderFrontendLink` (used to compute the expected `linkUrl`).
- **`src/modules/orders/domain/totals.ts`** — likely origin of `orderTotal`; the test depends on its calculation being correct to validate the email's `total` field.

## Notes

- The `ORDER` fixture is intentionally asymmetric (different titles, quantities, and prices per line) so that a swap or off-by-one in line rendering is caught.
- The `YEN` fixture exists specifically to detect a builder that hard-codes the euro symbol or always uses two decimals; a correct builder must render `¥1,990` (no decimals) for JPY.
- The deadline test (`12:30 PM` / `CEST`) asserts the shop's local timezone rendering, not the raw UTC instant — a regression to UTC would silently mislead an international buyer.
- `bic` is optional: one test confirms it is `undefined` when absent from instructions, another confirms it is carried when present.
- Every mail is checked for the absence of raw i18n keys (pattern `^payments\.`) in user-visible strings, guarding against a missing translation silently shipping the key to the customer.
