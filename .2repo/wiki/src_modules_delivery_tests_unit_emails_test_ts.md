# src/modules/delivery/tests/unit/emails.test.ts

## Purpose

Unit tests for the `shipmentShippedEmail` builder. They verify that the dispatch email assembles correctly: the tracking code is interpolated (not echoed as a template token), the customer name appears in the greeting, all copy slots resolve to real text rather than raw keys, and locale is carried through to produce genuinely different output per language.

## Key elements

- **`NAME` / `CODE`** – Fixed test fixtures (`'Ada Lovelace'`, `'TRK-99887766'`) shared across every case.
- **`describe('shipmentShippedEmail')`** – Five assertions covering:
  - Template name is the static string `'delivery.shipment-shipped'`.
  - `data.tracking` contains the code and contains **no** `{{` marker (interpolation actually ran).
  - `data.greeting` includes the customer name.
  - `subject`, `data.pageMetaTitle`, `data.body`, `data.footer` are all non-empty and do not begin with a `delivery.` key prefix; `data.pageMetaLinks` is an empty array.
  - Locale `'it'` yields a different `subject` than `'en'` while `data.locale` reflects the input.

## Relationships

- **`src/modules/delivery/emails.ts`** – Sole import target. `shipmentShippedEmail(locale, name, tracking)` is the function under test; no other symbols from that module are exercised here.

## Notes

- The tracking-code assertion is the load-bearing test: the file's own comment calls it "the one actionable fact in the whole email." A regression that renders an empty or double-`{{` string will fail `toContain(CODE)` **and** `not.toContain('{{')`.
- The "resolves every copy slot" test iterates over four fields in a loop; adding a new slot to the email data shape will not be covered unless the array in that test is updated.
- The locale test only compares `subject`; body-level translation differences are not asserted.
