# src/modules/products/tests/unit/validation-messages.test.ts

## Purpose

Unit test that verifies the product catalogue's Zod schema emits **locale-specific** validation messages (Italian) rather than Zod's built-in English defaults. It guards the i18n wiring between the schema in `@modules/products/model` and the product translation namespace.

## Key elements

- **`copy(locale)`** – helper that pulls the `products` sub-object out of the merged i18n resources for `'en'` or `'it'`, so assertions can reference message keys directly (e.g. `it['field-title-min']`).
- **`describe('product validation messages')`** – single suite.
- **`it('uses the Italian copy verbatim, not a Zod default')`** – loads the module under the `'it'` locale via `loadBeforeI18n`, calls `safeParse` with a deliberately invalid payload (`title: 'ab'`, `price: -1`), and asserts the error messages match the Italian translation strings for `field-title-min` and `field-price-min`.

## Relationships

- **`tests/support/i18n-boot.ts`** – provides `loadBeforeI18n` (bootstraps the i18n runtime for a given locale *before* dynamically importing the module under test) and `mergedResources` (exposes the resolved resource bundle for the active locale). This file depends on both for locale setup and message lookup.

## Notes

- The module doc-block explicitly delegates the full i18n explanation to `modules/users`; this test is a thin, catalogue-specific mirror of that pattern.
- The test passes a **key hint** (`'products.field-title-min'`) as the third argument to `loadBeforeI18n`—this is the i18n-boot mechanism for pre-loading the specific resource key the assertion will need.
- Only the Italian locale is asserted; there is no symmetric `'en'` test in this file.
