---
source: src/modules/delivery/emails.ts
sha256: 38b56c44a163c1f2f8966e206557bda92045151e842518e515c7a2d2c240965e
generated_at: 2026-11-08T05:30:05.377914+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/emails.ts

## Purpose
Builds the finished, fully-resolved email copy for all delivery lifecycle notifications (shipped, delivered, lost, hold-notice, fulfillment-delayed). The language is an input argument; the output is final text that the mailer adapter renders without further resolution — the same contract as `@modules/account/emails`.

## Key elements

- **`EmailLine`** — `{ title, quantity }`; one line of a shipment as the email lists it.
- **`TrackingVariant`** — `'added' | 'corrected'`; selects a distinct subject/body when a tracking code arrives after the shipment already left.
- **`ShippedEmailInput` / `DeliveredEmailInput` / `LostEmailInput` / `HoldNoticeEmailInput` / `FulfillmentDelayedEmailInput`** — input shapes each email function expects.
- **`longDate(locale, date)`** (private) — formats a date long-style in the **shop's timezone** via `Intl.DateTimeFormat`.
- **`lineTexts(t, lines)`** (private) — maps each `EmailLine` to a translated `"2 × Title"` string.
- **`shipmentShippedEmail(locale, name, input)`** — "on its way" email; tracking line is `undefined` when absent (the template guards with `typeof`), `more` line only when `remainingUnits > 0`.
- **`shipmentDeliveredEmail(locale, name, input)`** — "arrived" email; `withdraw` deadline rendered in **UTC** (CRD Art. 9(2)(b)(i) calendar day) rather than shop timezone.
- **`shipmentLostEmail(locale, name, input)`** — lost/damaged email; reason-specific subject & body; `message` coalesced to `''` to survive JSON queue serialization.
- **`holdNoticeEmail(locale, name, input)`** — hold-notice email (`check_address` or `delayed`); buyer-facing only, never leaks staff rationale.
- **`fulfillmentDelayedEmail(locale, name, input)`** — late-fulfillment email; internally maps `reason` + `expectedAt` to one of three template variants: `moved`, `passed`, `cleared`.

## Relationships

- **`src/infrastructure/adapters/mailer.ts`** — imports the `EmailContent` type that every function returns.
- **`src/infrastructure/i18n/index.ts` / `context.ts`** — imports `translator` to produce per-locale `t()` calls.
- **`src/modules/shop/index.ts`** — imports `shopTimezone()` for `longDate`.
- **`src/types/index.ts`** — imports `FulfillmentHeldParamsNotice` and `ShipmentLostReason` enums.
- **`src/modules/delivery/services/notify.ts`** — the caller that constructs the input objects and passes them to these functions.
- **`src/modules/delivery/index.ts`** — re-exports the public email functions for external consumers.
- **`src/modules/delivery/tests/unit/emails.test.ts`** — unit tests for the shipped/delivered/lost/hold-notice builders.
- **`src/modules/delivery/tests/unit/fulfillment.test.ts`** — tests the fulfillment-delayed email.
- **`tests/unit/infrastructure/adapters/mailer-templates.test.ts`** — verifies the templates that consume the `data` payloads produced here.

## Notes

- **JSON-queue gotcha:** Any `undefined` value in the `data` object is silently dropped when the job crosses a JSON queue. Fields the template reads unconditionally (e.g. `message`) are coalesced to `''` rather than left `undefined`.
- **Two timezone conventions coexist:** general dates use the shop's timezone; the withdrawal deadline (`withdrawUntil`) is intentionally formatted in UTC because it represents a calendar-day boundary defined by CRD, and a local render could shift it to the previous evening.
- **Tracking `undefined` is intentional:** the template uses a `typeof tracking !== "undefined"` guard (not a truthiness check), so omitting the key and passing `undefined` behave identically — same convention as `payments`' optional fields.
- **Fulfillment-delayed variant mapping is non-obvious:** `reason === 'due'` always maps to template variant `passed`; `reason === 'moved'` maps to `moved` *or* `cleared` depending on whether `expectedAt` is present.
- **Staff messages are buyer-facing only:** `shipmentLostEmail` and `holdNoticeEmail` explicitly exclude internal staff notes; only the `message` field (written for the buyer) is included.
