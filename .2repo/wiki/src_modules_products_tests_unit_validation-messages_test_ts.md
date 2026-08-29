# src/modules/products/tests/unit/validation-messages.test.ts

## Purpose

Verifies that the products module's Zod schema emits validation messages from the active locale's translation copy (Italian) rather than falling back to Zod's built-in English defaults. It is the catalogue-schema counterpart to the analogous test documented in `modules/users`.

## Key elements

- **`copy(locale)`** – Helper that pulls the `products` sub-namespace out of `mergedResources()` for a given locale, returning a flat `Record<string, string>` of message keys.
- **`describe('product validation messages')`** – Single test that:
  - Loads `zodProductSchema` (from `@modules/products/model`) with Italian i18n active via `loadBeforeI18n`.
  - Parses an invalid product object (`title: 'ab'`, `price: -1`).
  - Asserts the emitted error messages include the Italian strings for `field-title-min` and `field-price-min` verbatim.

## Relationships

- **`tests/support/i18n-boot.ts`** – Provides `loadBeforeI18n` (initializes i18n for a locale *before* the target module is imported, so its thunks bind to the right language) and `mergedResources` (exposes the already-merged translation bundle for direct key lookups). Both are consumed here.
- **`@modules/products/model`** – Exports `zodProductSchema`; the test's parse call exercises its `title` and `price` field constraints.

## Notes

- The file header comment explicitly cross-references the `modules/users` test as the "full documentation" of the failure mode being defended; read that file for context on *why* locale-bound copy can silently regress to Zod defaults.
- `loadBeforeI18n` is critical: importing the model without first activating the target locale would bind the schema's message thunks to English, making the assertion pass for the wrong reason.
- The test only covers two fields (`field-title-min`, `field-price-min`); it is a sentinel for the "copy resolves against locale" invariant, not an exhaustive message-coverage suite.
