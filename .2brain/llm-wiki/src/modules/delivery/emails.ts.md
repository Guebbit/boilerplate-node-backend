---
source: src/modules/delivery/emails.ts
sha256: 12144fc67b6cd380a19188458f42ffccb87fb16c8949b060ae9571ddff4df104
generated_at: 2026-10-14T15:23:44.609958+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/emails.ts

## Purpose

Builds the finished, i18n-resolved email content for the three delivery notifications: shipment shipped, shipment delivered, and preorder delayed. Each function takes a locale plus domain data and returns a fully rendered `EmailContent` object ready for the mailer to send. Follows the same "language is an argument, output is finished text" convention as `@modules/account/emails`.

## Key elements

- **`EmailLine`** (interface) — a single product line: `title` + `quantity`.
- **`ShippedEmailInput`** (interface) — lines, optional `trackingCode`, `remainingUnits`.
- **`DeliveredEmailInput`** (interface) — lines, optional `withdrawUntil` (present only on the delivery that completes the order).
- **`PreorderDelayedEmailInput`** (interface) — product `titles`, `agreedAt`, optional `expectedAt`, `needsAnswer`, optional `answerBy`, `orderUrl`.
- **`longDate`** (private) — formats a `Date` as a long, locale-specific string in **UTC**.
- **`lineTexts`** (private) — maps `EmailLine[]` to translated "2 × Title" strings via the `delivery.email-line` i18n key.
- **`shipmentShippedEmail`** (export) — builds the "on its way" email; conditionally includes tracking and "more to come" sections.
- **`shipmentDeliveredEmail`** (export) — builds the "arrived" email; includes a withdrawal deadline (CRD Art. 9(2)(b)(i)) only when `withdrawUntil` is set.
- **`preorderDelayedEmail`** (export) — builds the "your preorder will be late" email with three body variants (`moved`, `ask-moved`, `ask-passed`) chosen from `needsAnswer` × `expectedAt`.

## Relationships

- **`src/infrastructure/adapters/mailer.ts`** — imports the `EmailContent` type; every exported function returns that shape (`template`, `subject`, `data`).
- **`src/infrastructure/i18n/index.ts` / `context.ts`** — imports `translator` to resolve all user-facing strings at call time.
- **`src/modules/delivery/services/notify.ts`** — upstream caller that assembles the input objects and invokes these builders when a shipment or preorder event fires.
- **`src/modules/delivery/index.ts`** — barrel re-export making the three builders available to the rest of the module.
- **`tests/unit/infrastructure/adapters/mailer-templates.test.ts`** — validates the template keys referenced here (`delivery.shipment-shipped`, `delivery.shipment-delivered`, `delivery.preorder-delayed`) and their field contracts.
- **`src/modules/delivery/tests/unit/emails.test.ts`** — unit tests for the three builders.

## Notes

- All date rendering is deliberately **UTC** (`timeZone: 'UTC'`). A local render could shift a calendar day (e.g., the withdrawal deadline), which is why the helper and the inline `Intl.DateTimeFormat` call both pin UTC.
- Optional sections (tracking, "more to come", withdrawal deadline, answer deadline) are signalled by passing `undefined` in `data`. The server-side templates guard with `typeof value !== "undefined"`, so `undefined` is meaningful and distinct from `""`.
- `pageMetaLinks` is always `[]`; it exists in the contract but is unused by these three emails.
- The preorder-delayed email's variant string is interpolated into the i18n key (`delivery.email-preorder-delayed.${variant}.subject`), so adding a new variant requires new translation keys.
