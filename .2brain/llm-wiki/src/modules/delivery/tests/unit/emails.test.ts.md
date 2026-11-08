---
source: src/modules/delivery/tests/unit/emails.test.ts
sha256: 313bbc95506fcefe3c65c59ca6cd04b69696c5314dda4b732269872f577580ae
generated_at: 2026-11-08T05:45:25.819469+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/tests/unit/emails.test.ts

## Purpose

Unit tests for the four customer-facing shipment email builders. Each test block asserts that the builder produces a correctly named template, fully-interpolated copy in both supported locales, the right conditional fields (tracking code, remaining-items note, withdrawal deadline, owed items), and that no unrendered template keys leak into any output slot.

## Key elements

- **Fixtures** — `NAME`, `CODE`, `LINES`, `completing`: shared input shapes used across all four blocks so tests stay focused on output contract rather than setup.
- **`describe('shipmentShippedEmail')`** — Verifies template ID, tracking-code presence/absence, three distinct `variant` wordings (default / `added` / `corrected`), line formatting (`"2 × Analytical Engine"`), the `more` field appearing only when `remainingUnits > 0`, greeting, locale propagation, and copy-slot resolution.
- **`describe('shipmentDeliveredEmail')`** — Verifies template ID, line list, greeting, `withdraw` deadline rendering (UTC date only, no time, correct locale), and that `withdraw` is `undefined` on non-final deliveries.
- **`describe('fulfillmentDelayedEmail')`** — Verifies three reason-based wordings (`moved` with new date, `moved` without date, `due`), "shop calendar" date rendering (UTC→shop-local shift), the fixed cancellation closing line in both locales, and absence of an `answer` field.
- **`describe('shipmentLostEmail')`** — Verifies template ID, distinct copy for `reason: 'lost'` vs `'damaged'`, line list, `owedIntro`/`owedLines` present only when `owed` is non-empty, and that `message` is always a string (empty by default).
- **Copy-slot guard** — Repeated across all blocks: every string slot is asserted non-empty and not matching `/^delivery\./`, catching unresolvable i18n keys.

## Relationships

- **`src/modules/delivery/emails.ts`** — Sole import target. The test file exercises the four exported builders (`shipmentShippedEmail`, `shipmentDeliveredEmail`, `fulfillmentDelayedEmail`, `shipmentLostEmail`) and their return shape (`template`, `subject`, `data.*`). No other module is touched.

## Notes

- **Conditional-field conventions are inconsistent by design**: `withdraw`, `more`, and `tracking` are `undefined` when absent, but `owedIntro` is the empty string `''` and `message` is always a string. Tests pin both behaviors; changing one without the other will break assertions.
- **Date rendering is "shop calendar"**: `fulfillmentDelayedEmail` tests pass UTC timestamps that correspond to a *later* local date (e.g., `23:00Z` = next day in Rome) and assert the shifted date. The builders must use the shop's timezone, not UTC, for date-only display.
- **`withdraw` prints date-only** — a test explicitly asserts no `\d:\d\d` time component and no silent grace-day addition, even when the frozen instant is just past UTC midnight.
- **Variant triples**: `shipmentShippedEmail` and `fulfillmentDelayedEmail` each produce three distinct subject+body pairs. Tests use `Set.size === 3` to catch accidental deduplication.
- **No network, no DB, no clock mocking** — all assertions are pure output-shape checks; the only "time" values are fixed `Date` literals passed as input.
