---
source: src/modules/delivery/emails.ts
sha256: 9fa6370e0292b40407a6c144faa13f62e3fe778ad759df99269a846c5b22eb9d
generated_at: 2026-10-15T10:27:01.798270+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/emails.ts

## Purpose

Builds the finished-text email content for the three delivery notifications: shipment shipped, shipment delivered, and preorder delayed. Following the same convention as `@modules/account/emails`, the buyer's language is a parameter and every string is fully resolved before the mailer receives it — no template variables survive past this file.

## Key elements

- **`EmailLine`** — A single product line (title + quantity) as listed in an email.
- **`ShippedEmailInput`** — Lines, optional `trackingCode`, and `remainingUnits` for the "on its way" email.
- **`DeliveredEmailInput`** — Lines and optional `withdrawUntil` deadline for the "arrived" email.
- **`PreorderDelayedEmailInput`** — Titles, `agreedAt`, optional `expectedAt`, `needsAnswer` flag, optional `answerBy`, and `orderUrl` for the preorder-delay email.
- **`longDate`** (internal) — Formats a `Date` as a long date string in the given locale, always UTC.
- **`lineTexts`** (internal) — Maps `EmailLine[]` to localized `"2 × Title"` strings via the i18n key `delivery.email-line`.
- **`shipmentShippedEmail`** — Returns `EmailContent` for template `delivery.shipment-shipped`; includes tracking line only when a code exists and a "more to follow" line only when `remainingUnits > 0`.
- **`shipmentDeliveredEmail`** — Returns `EmailContent` for template `delivery.shipment-delivered`; includes the withdrawal deadline line only when `withdrawUntil` is set.
- **`preorderDelayedEmail`** — Returns `EmailContent` for template `delivery.preorder-delayed`; selects one of three i18n variants (`moved`, `ask-moved`, `ask-passed`) based on `needsAnswer` and whether `expectedAt` is present.

## Relationships

- **`src/infrastructure/adapters/mailer.ts`** — Imports the `EmailContent` return type; each exported function produces an object matching that shape (`template`, `subject`, `data`).
- **`src/infrastructure/i18n/index.ts` / `context.ts`** — Imports `translator`; every string in the returned `data` is produced by calling the translator.
- **`src/modules/delivery/index.ts`** — Re-exports this module's public API for the rest of the application.
- **`src/modules/delivery/services/notify.ts`** — Consumes the three email builders to dispatch notifications.
- **`src/modules/delivery/tests/unit/emails.test.ts`** — Unit-tests the three builders and the internal helpers.
- **`tests/unit/infrastructure/adapters/mailer-templates.test.ts`** — Validates that the `data` keys and `template` names produced here match the mailer's template expectations.

## Notes

- **`undefined` as "absent"**: Optional fields (`tracking`, `more`, `withdraw`, `answer`) are set to `undefined` (not `''`) so the mailer template's `typeof x !== "undefined"` guard renders the conditional block as absent. Do not substitute an empty string.
- **UTC dates**: All date rendering uses `timeZone: 'UTC'` explicitly. The withdrawal deadline in particular is a UTC calendar day per CRD Art. 9(2)(b)(i); a local-time render could shift it to the prior day.
- **Preorder-delay variant logic**: The `needsAnswer` + `expectedAt` pair drives which of three i18n key sets is used (`moved`, `ask-moved`, `ask-passed`). When `needsAnswer` is false, the "answer" slot always falls back to the `cancel-any-time` string.
- **`lines` in preorder-delayed**: Unlike the other two emails (which use `lineTexts`), this email passes raw `string[]` titles through a spread (`[...input.titles]`) and lets the template handle presentation.
