---
source: src/modules/delivery/tests/unit/emails.test.ts
sha256: 313bbc95506fcefe3c65c59ca6cd04b69696c5314dda4b732269872f577580ae
generated_at: 2026-10-29T03:48:57.015616+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/tests/unit/emails.test.ts

## Purpose

Unit tests for the four customer-facing delivery email builders. Each test verifies that the actionable fields a customer relies on (tracking code, withdrawal deadline, owed items) render correctly, that i18n keys are fully resolved (never leaked as raw `delivery.*` strings), and that locale-specific copy differs between `en` and `it`.

## Key elements

- **Fixtures** — `NAME`, `CODE`, `LINES`, and `completing` (a full-shipment payload) are shared constants used across all describe blocks.
- **`describe('shipmentShippedEmail')`** — Asserts template name, tracking-code presence (and absence of uninterpolated `{{`), three distinct subjects/bodies for the `added`/`corrected`/default variants, line formatting (`qty × title`), conditional `more` field, greeting, locale passthrough, and full i18n resolution.
- **`describe('shipmentDeliveredEmail')`** — Asserts the `withdraw` deadline is date-only (no time-of-day), rendered in the buyer's locale, present only on the last delivery; plus lines, greeting, and i18n resolution.
- **`describe('fulfillmentDelayedEmail')`** — Asserts dates render on the shop's local calendar (UTC-offset aware), three reason variants (`moved`, cleared, `due`) each produce unique subjects and bodies, a fixed "cancel any time" closing in both locales, and no `answer` slot is emitted.
- **`describe('shipmentLostEmail')`** — Asserts `lost` vs `damaged` reason variants produce distinct copy, `owed` items and `owedIntro` appear only when non-empty, `message` defaults to `''`, and i18n resolution holds.
- **Recurring "resolves every copy slot" check** — Each block iterates over `subject`, `data.pageMetaTitle`, `data.body`, etc., asserting none is empty and none matches `/^delivery\./`.

## Relationships

- **`src/modules/delivery/emails.ts`** — Sole import source. This test file calls every exported builder (`shipmentShippedEmail`, `shipmentDeliveredEmail`, `fulfillmentDelayedEmail`, `shipmentLostEmail`) and asserts on their return shape (`template`, `subject`, `data.*`). No other files are imported.

## Notes

- **Date-rendering tests are locale- and timezone-sensitive.** The `fulfillmentDelayedEmail` tests use `23:00Z` inputs to simulate Rome local midnight (UTC+1), verifying the rendered date advances by one day. The `shipmentDeliveredEmail` test uses `00:00:00.001` UTC to confirm the mail never rounds back to the prior day and never appends a time.
- **Tracking-code absence is explicit.** When `trackingCode` is `undefined`, `data.tracking` must be `undefined` (not an empty string or a leftover template token).
- **The `{{` regex guard** appears in multiple assertions as a safety net against un-interpolated Handlebars-style placeholders leaking into customer-visible text.
- **`it.each`** is used only once (delayed-email closing text) to parameterize the en/it expectation while looping over three reason scenarios inside.
