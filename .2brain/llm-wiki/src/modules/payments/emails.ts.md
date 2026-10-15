---
source: src/modules/payments/emails.ts
sha256: 3257a862533c59661a706f0c1e9fb420d4207ee9d85b496023089453e18afecc
generated_at: 2026-10-15T11:25:32.335268+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/emails.ts

## Purpose

Builds the finished, locale-resolved content for the two outbound emails the payments module sends: "payment received" (when a payment settles) and "refund issued" (when a non-return refund completes). Following the same convention as `@modules/account/emails`, the language is an explicit argument and the output is fully-interpolated text; the downstream mail template only does structural layout.

## Key elements

- **`money` (internal)** — Formats a decimal amount as a locale-aware currency string via `Intl.NumberFormat`.
- **`paymentReceivedEmail` (exported)** — Returns an `EmailContent` object with template key `payments.payment-received`, a localized subject, per-line item descriptions, a computed order total, and a frontend link to the order page.
- **`refundIssuedEmail` (exported)** — Returns an `EmailContent` object with template key `payments.refund-issued`, a localized body embedding the refund amount, and a full-vs-partial detail line chosen by the `full` flag.

## Relationships

- **`src/infrastructure/adapters/mailer.ts`** — Imports the `EmailContent` type; both builders conform their return shape to it.
- **`src/infrastructure/i18n/index.ts`** — Imports `translator` to obtain a locale-scoped translation function for every string in both emails.
- **`src/modules/orders/index.ts`** — Imports `orderFrontendLink`, `orderTotal`, and the `OrderLines` type; used in `paymentReceivedEmail` to compute the total and build the order-page URL.
- **`src/modules/payments/services/notify.ts`** — Expected caller that invokes these builders after settlement/refund events.
- **`src/modules/payments/tests/unit/emails.test.ts`** — Unit tests for both builders.
- **`tests/unit/infrastructure/adapters/mailer-templates.test.ts`** — Validates that the template keys (`payments.payment-received`, `payments.refund-issued`) and their required `data` fields exist in the template registry.

## Notes

- The module doc explicitly points to `@modules/account/emails` as the canonical example of this "resolve-then-interpolate" pattern.
- In `paymentReceivedEmail`, the `data` object uses **explicit field assignment** rather than spreading `order`. The comment explains why: `order` is often a hydrated Mongoose document whose schema paths live on the prototype, so a spread copies nothing.
- `refundIssuedEmail` is deliberately **not** used for return-triggered refunds; those are announced by the returns module's own closing notice.
- The `full` parameter in `refundIssuedEmail` selects between `detail-full` and `detail-partial` i18n keys, allowing the copy to distinguish a complete refund from a partial one.
