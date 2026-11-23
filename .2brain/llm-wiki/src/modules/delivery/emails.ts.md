---
source: src/modules/delivery/emails.ts
source_sha256: d96785dc16f002bb23c2ae41c882d29a309052b2376a87fd28cdac754be24ed0
context_sha256: 7d3e4b78921df889d7f29102224089da80639b3e192ec5fb7a00751713e65108
generated_at: 2026-11-22T04:49:32.244407+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/delivery/emails.ts

## Purpose
Builds the finished, localized content of the emails the delivery module sends. Each function takes a locale as an argument and returns an `EmailContent` whose strings are already translated, so whatever renders the template later resolves no translations. It follows the same rule as `@modules/account/emails`.

## Key elements
- **`shipmentShippedEmail(locale, name, input)`**: the "on its way" email, template `delivery.shipment-shipped`.
  - It lists the shipment's lines.
  - It adds a tracking line only when `trackingCode` is set.
  - It adds a "more to follow" line only when `remainingUnits > 0`.
  - An optional `variant` (`'added'` | `'corrected'`) selects a different subject and body for a resend after a tracking-code change.
- **`shipmentDeliveredEmail(locale, name, input)`**: the "arrived" email, template `delivery.shipment-delivered`. When `withdrawUntil` is present, it adds a withdrawal deadline. That date is formatted in UTC because the deadline is a UTC calendar day.
- **`shipmentLostEmail(locale, name, input)`**: the lost or damaged parcel email, template `delivery.shipment-lost`.
  - Subject and body are chosen by `reason`.
  - It lists the parcel's lines, any `owed` lines with the `expectedAt` date, and staff's optional message.
  - It includes an order-page link.
  - Staff's internal notes are never included.
- **`holdNoticeEmail(locale, name, input)`**: template `delivery.hold-notice`. The text is chosen by `notice` (`check_address` or `delayed`). It also carries staff's optional message and an order link. It does not say why staff held the order.
- **`fulfillmentDelayedEmail(locale, name, input)`**: template `delivery.fulfillment-delayed`, for a waiting fulfillment order.
  - The wording variant is `passed` when `reason` is `'due'`, otherwise `moved` if `expectedAt` is set, otherwise `cleared`.
  - The rest of this function is cut off in the provided source.
- **Input types**: `EmailLine`, `TrackingVariant`, `ShippedEmailInput`, `DeliveredEmailInput`, `LostEmailInput`, `FulfillmentDelayedEmailInput` and `HoldNoticeEmailInput`.
- **Private helpers**:
  - `longDate` formats a long date in the buyer's locale on the shop's timezone.
  - `lineTexts` renders lines as text via the `delivery.email-line` key.

## Relationships
- `@infrastructure/adapters/mailer` (`src/infrastructure/adapters/mailer.ts`): supplies the `EmailContent` type that every function returns. The `template` names and `data` keys must match the mailer's templates. `tests/unit/infrastructure/adapters/mailer-templates.test.ts` is related.
- `@infrastructure/i18n` (`src/infrastructure/i18n/index.ts`): supplies `translator(locale)`, used for all copy.
- `@modules/shop` (`src/modules/shop/index.ts`): supplies `shopTimezone()`, used by `longDate`.
- `@types` (`src/types/index.ts`): supplies `FulfillmentHeldParamsNotice` and `ShipmentLostReason`.
- `src/modules/delivery/tests/unit/emails.test.ts` tests this file.

## Notes
- `message` is always a string (`''` when absent) in the lost and hold-notice emails. The job crosses a queue as JSON, which drops `undefined` keys, and the template reads `message` unconditionally. A missing key would cause a ReferenceError.
- `tracking` and `more` in the shipped email are left `undefined` when they do not apply. The template guards them with `typeof ... !== "undefined"`.
- Dates use two timezone conventions. Shop-calendar dates (`longDate`) use the shop's timezone. The withdrawal deadline uses UTC.
- Translation keys for the shipped, lost, hold-notice and delayed emails are built dynamically from the variant, reason or notice (for example `delivery.email-lost.${reason}.subject`). A new reason or notice therefore needs matching locale keys.
