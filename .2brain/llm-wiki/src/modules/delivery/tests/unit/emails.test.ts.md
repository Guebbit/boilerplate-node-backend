---
source: src/modules/delivery/tests/unit/emails.test.ts
source_sha256: c53aa360bf85592ce863f923e357308df5979f412a824521666c3643015e6106
context_sha256: 648976fb4f5e9073ff90aac37b50ce8d3d79ecc9523b3ee88b7b03c80b33b872
generated_at: 2026-11-22T05:03:50.404798+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/delivery/tests/unit/emails.test.ts

## Purpose
Unit tests for the four delivery email builders in `@modules/delivery/emails`. The tests focus on the fields a customer acts on: the tracking code, how many items are still to come, and the withdrawal deadline. They check that none of these render empty, as a raw translation key, or with an unresolved `{{` placeholder.

## Key elements
- **Fixtures**: `NAME` ("Ada Lovelace"), `CODE` ("TRK-99887766"), `LINES` (two order lines) and `completing`, a shipment with a tracking code and `remainingUnits: 0`.
- **`shipmentShippedEmail` tests**
  - Template name is `delivery.shipment-shipped`.
  - `data.tracking` contains the code and no `{{`.
  - The `variant` values `'corrected'` and `'added'` each get a distinct subject and body in `en` and `it`, and their tracking text matches the default.
  - `tracking` is undefined when there is no `trackingCode`.
  - `lines` is formatted as `"2 × Analytical Engine"`.
  - `more` appears only when `remainingUnits > 0`.
  - The greeting contains the name.
  - Every copy slot is non-empty and not a `delivery.*` key.
  - `locale` is passed through and `it` has a different subject from `en`.
- **`shipmentDeliveredEmail` tests**
  - Template is `delivery.shipment-delivered`, with the lines and greeting rendered.
  - `data.withdraw` appears only when `withdrawUntil` is given, i.e. on the last delivery.
    - English reads "the end of November 14, 2026".
    - Italian reads "fino a tutto il 14 novembre 2026".
  - The date is UTC and date-only. 00:00:00.001 UTC on Nov 15 prints as Nov 15, with no time and no extra grace day.
- **`fulfillmentDelayedEmail` tests**
  - Dates are printed on the shop's calendar. A Rome-midnight instant stored as 23:00Z prints as the next day.
  - `closing` carries the same "cancel any time before it ships" text for all three wordings, in `en` and `it`. There is no `answer` property.
  - The three wordings are `moved` with `expectedAt`, `moved` without it, and `due`. Each has its own body and subject.
  - Every copy slot resolves.
- **`shipmentLostEmail` tests**
  - Template is `delivery.shipment-lost`, with different subject and body for `lost` and `damaged` in both languages.
  - The lines and greeting are rendered.
  - `owedIntro` and `owedLines` appear only when `owed` is non-empty. `owedIntro` is `''` otherwise.
  - `data.message` is always a string: `''` when staff wrote none, otherwise the staff text.

## Relationships
Imports `shipmentShippedEmail`, `shipmentDeliveredEmail`, `fulfillmentDelayedEmail` and `shipmentLostEmail` from `src/modules/delivery/emails.ts` through the `@modules/delivery/emails` alias. The tests call them directly and inspect the returned `template`, `subject` and `data`. They use no mocks.

## Notes
- The test names show that the builders take `(locale, name, options)` and support `en` and `it`.
- The `'corrected'`/`'added'` test asserts `fixed.data.tracking` equals `first.data.tracking` twice. The duplicate assertion is redundant.
- `describe`, `it` and `expect` are used without imports, so they come from global test setup.
