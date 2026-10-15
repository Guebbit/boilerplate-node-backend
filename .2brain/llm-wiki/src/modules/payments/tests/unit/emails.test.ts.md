---
source: src/modules/payments/tests/unit/emails.test.ts
sha256: 8de88fe9af83cf559876b01d8ae26ab531415e4f4a0faaa8caf36ae77a58b2c3
generated_at: 2026-10-15T11:38:13.554887+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/tests/unit/emails.test.ts

## Purpose

Unit tests for the two payment email builders (`paymentReceivedEmail`, `refundIssuedEmail`). Because a formatting slip in a money email reads as a billing error to the customer, these tests pin down template names, line rendering, total/link correctness, locale translation, and full-vs-partial refund wording.

## Key elements

- **`ORDER` fixture** — Two items with deliberately different titles, quantities, and prices (so no field can silently substitute for another), plus a shipping cost and `EUR` currency. Shared by both `describe` blocks.
- **`paymentReceivedEmail` tests** — Verify the `payments.payment-received` template, one rendered line per order item, the computed grand total (shipping included) via `orderTotal`, the order link via `orderFrontendLink`, and that subjects differ across `en`/`it` locales with no raw key leaking.
- **`refundIssuedEmail` tests** — Verify the `payments.refund-issued` template, the refund reference number and formatted amount (e.g. `12.50`) in the body, that `isFullRefund = true` vs `false` produces different detail text ("everything" vs "part"), and locale-sensitive subjects.

## Relationships

- **`src/modules/payments/emails.ts`** — The module under test; provides `paymentReceivedEmail` and `refundIssuedEmail`.
- **`src/modules/orders/index.ts`** — Barrel import source for `orderTotal` and `orderFrontendLink`, used as reference oracles in assertions.
- **`src/modules/orders/domain/totals.ts`** — Underlying implementation of `orderTotal`; the test's `ORDER` shape (items array, shippingCost, currency) must match its expected input contract.
- **`src/modules/orders/config.ts`** — Likely source of `orderFrontendLink`'s URL construction; the test asserts the exact link the function produces for a given locale + order id.

## Notes

- The test asserts the formatted string `"12.50"` (not just `12.5`) in the refund body, so currency number formatting is part of the email contract, not just a display concern.
- Locale tests compare *subjects* to each other rather than asserting a specific string, keeping them resilient to copy changes while still catching "key leaked through" regressions.
- The `ORDER` fixture is a plain object, not a domain entity — if `orderTotal`'s input type changes, the fixture will need a cast or restructure.
