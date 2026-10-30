---
source: src/modules/delivery/emails.ts
sha256: 38b56c44a163c1f2f8966e206557bda92045151e842518e515c7a2d2c240965e
generated_at: 2026-10-29T03:34:34.865997+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/emails.ts

## Purpose

Resolves the copy for all delivery-related buyer emails into finished, fully-localized strings. Each exported function takes a locale and structured input, calls the i18n translator, and returns an `EmailContent` object ready for the mailer to send. Nothing is left to be resolved at render time — the language is an argument, the output is final text.

## Key elements

- **`EmailLine`** — minimal line-item shape (`title`, `quantity`) used across all email inputs.
- **`TrackingVariant`** — `'added' | 'corrected'`; selects a different subject/body when a tracking code is sent after the shipment already left.
- **`ShippedEmailInput` / `DeliveredEmailInput` / `LostEmailInput` / `HoldNoticeEmailInput` / `FulfillmentDelayedEmailInput`** — input interfaces for each email; all carry only data, no resolved strings.
- **`longDate(locale, date)`** (private) — formats a date long-style in the shop's timezone via `Intl.DateTimeFormat`.
- **`lineTexts(t, lines)`** (private) — maps `EmailLine[]` to translated `"quantity × title"` strings.
- **`shipmentShippedEmail`** — "on its way" email; optionally includes a tracking line, a "more to come" line, and variant-specific subject/body when the tracking code was added or corrected after departure.
- **`shipmentDeliveredEmail`** — "arrived" email; on the final delivery also shows the withdrawal deadline (rendered in UTC per CRD Art. 9(2)(b)(i)).
- **`shipmentLostEmail`** — lost/damaged-parcel email; includes reason-specific text, owed lines with expected date (when the shelf cannot re-cover), and an optional staff message.
- **`holdNoticeEmail`** — hold-notice email (`check_address` or `delayed`); includes an optional staff message and a link to the order page.
- **`fulfillmentDelayedEmail`** — "will be late" email; maps three internal states (`due` → `passed`, `expectedAt` present → `moved`, absent → `cleared`) to distinct template variants.

## Relationships

- **`src/infrastructure/adapters/mailer.ts`** — provides the `EmailContent` return type consumed by every builder.
- **`src/infrastructure/i18n/index.ts`** (and `context.ts`) — provides `translator`, the sole i18n entry point used for all string resolution.
- **`src/modules/shop/index.ts`** / **`src/modules/shop/service.ts`** — provides `shopTimezone()` used by `longDate`.
- **`src/types/index.ts`** — provides `FulfillmentHeldParamsNotice` and `ShipmentLostReason` used in input interfaces.
- **`src/modules/delivery/index.ts`** — re-exports these functions to the rest of the app.
- **`src/modules/delivery/services/notify.ts`** — the service layer that calls these builders and hands the result to the mailer.
- **`src/modules/delivery/tests/unit/emails.test.ts`** — unit tests for shipped, delivered, lost, and hold-notice emails.
- **`src/modules/delivery/tests/unit/fulfillment.test.ts`** — unit tests covering `fulfillmentDelayedEmail`.
- **`tests/unit/infrastructure/adapters/mailer-templates.test.ts`** — validates the mailer templates these emails reference (e.g. `delivery.shipment-shipped`).

## Notes

- **`undefined` vs. missing key in template data:** In `shipmentShippedEmail`, `tracking` and `more` are set to `undefined` when absent; the template guards with `typeof x !== "undefined"`. In `shipmentLostEmail` and `holdNoticeEmail`, `message` is coerced with `?? ''` because the job crosses a message queue as JSON (dropping `undefined` keys) and the template reads the key unconditionally — a missing key would be a `ReferenceError`.
- **Two different timezone conventions:** `longDate` uses `shopTimezone()` for buyer-facing dates (expected delivery, owed units), but `shipmentDeliveredEmail` renders the withdrawal deadline in **UTC** because it is a statutory calendar day (CRD). Mixing them up shifts the date by a day.
- **`fulfillmentDelayedEmail` variant mapping is indirect:** the `reason` field (`'moved' | 'due'`) plus the presence of `expectedAt` together select one of three template keys (`passed`, `moved`, `cleared`). The `'due'` reason always maps to `passed` regardless of `expectedAt`.
- **Follows the same convention as `@modules/account/emails`:** language is a parameter, output is finished text, the renderer does no further i18n lookup.
