# src/modules/delivery/tests/unit/emails.test.ts

## Purpose

Unit tests for the `shipmentShippedEmail` builder. They pin down the customer-facing contract of the dispatch email: the tracking code must render as a real string (never an empty value or a `{{…}}` placeholder), the greeting must include the customer's name, every i18n copy slot must resolve to actual text rather than echoing a key, and the locale must drive a visibly different translation.

## Key elements

- **`shipmentShippedEmail`** (imported from `@modules/delivery/emails`) — the single function under test; takes `(locale, name, trackingCode)` and returns an object with `template`, `subject`, `data`.
- **`NAME` / `CODE`** — module-level test fixtures (`'Ada Lovelace'`, `'TRK-99887766'`) shared across all cases.
- **`describe('shipmentShippedEmail')`** — five `it` blocks covering:
  - Template identifier is `delivery.shipment-shipped`.
  - `data.tracking` contains the code and has **no** `{{` remnants (interpolation guard).
  - `data.greeting` includes the customer name.
  - `subject`, `data.pageMetaTitle`, `data.body`, `data.footer` are non-empty and do not start with `delivery.` (unresolved-key guard); `data.pageMetaLinks` is `[]`.
  - Locale round-trips into `data.locale`, and `en` vs `it` produce different `subject` strings.

## Relationships

- **→ `src/modules/delivery/emails.ts`** — sole import; provides `shipmentShippedEmail`. No other module is touched.

## Notes

- The `not.toContain('{{')` assertion on `tracking` is the critical regression guard: a broken interpolation here means the customer receives no usable tracking code.
- The `not.toMatch(/^delivery\./)` loop catches any copy slot that falls through to the raw i18n key instead of a translated string.
- `pageMetaLinks` is asserted as an **empty array** (not `undefined`), which is a structural expectation any consumer relying on `.length` or `.map` would need.
