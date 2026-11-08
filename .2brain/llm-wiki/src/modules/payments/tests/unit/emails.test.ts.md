---
source: src/modules/payments/tests/unit/emails.test.ts
sha256: 7eda6ff951747bff11537ca338f6f3876afb1e1501ee552079464b934575b3a4
generated_at: 2026-11-08T07:39:48.742420+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/tests/unit/emails.test.ts

## Purpose
Unit tests for the four payment email builders in `payments/emails.ts`. They verify that each email renders the correct template name, itemised lines, currency-formatted totals, order links, and locale-appropriate copy—because a formatting slip in a billing email is indistinguishable from a billing error to the recipient.

## Key elements

- **`ORDER` / `YEN` fixtures** – Two-line EUR order and a single-item JPY order (no-decimal currency). The JPY case specifically guards against euro-style decimal formatting.
- **`INSTRUCTIONS` / `PAY_BY` fixtures** – Bank-transfer details (beneficiary, IBAN, reference; BIC intentionally absent) and a UTC deadline that becomes 12:30 CEST in Rome.
- **`describe('paymentReceivedEmail')`** – Asserts template ID, per-item lines, `orderTotal` in the body, `orderFrontendLink` as `linkUrl`, and locale-dependent subjects with no leaked i18n keys.
- **`describe('refundIssuedEmail')`** – Asserts template ID, refund reference number, amount, the full-vs-partial distinction in `data.detail`, and locale translation.
- **`describe('the bank transfer mails')`** – Covers `transferInstructionsEmail` (all instruction fields, optional BIC, deadline rendered in shop-local timezone, locale) and `transferExpiredEmail` (template ID). A shared `it.each` block asserts both emails format money in the order's own currency (¥1,990, not €1,990.00).

## Relationships

- **`src/modules/payments/emails.ts`** – The module under test; source of all four `*Email` builder functions imported here.
- **`src/modules/orders/index.ts`** – Barrel re-export from which `orderTotal` and `orderFrontendLink` are imported for cross-checking that email data matches the canonical order helpers.
- **`src/modules/orders/domain/totals.ts`** – Implied origin of `orderTotal`; the test asserts `orderTotal(ORDER) === '226.75'` independently of the email output.
- **`src/modules/orders/config.ts`** – Implied origin of `orderFrontendLink`; the test compares the email's `linkUrl` against the helper's output for the same locale + order ID.

## Notes

- The JPY fixture exists to catch a builder that hard-codes euro decimal formatting; 1990 JPY must print as `¥1,990`, not `€1,990.00`.
- The deadline test asserts the shop's local zone (CEST / GMT+2) appears in the string, ensuring the timestamp is not rendered as raw UTC.
- BIC is tested as truly optional: the base `INSTRUCTIONS` object omits it, and a separate test confirms it appears only when supplied.
- Translation tests are intentionally shallow—they compare that EN ≠ IT subjects and scan for no `payments.*` key leakage—but do not assert specific translated copy.
