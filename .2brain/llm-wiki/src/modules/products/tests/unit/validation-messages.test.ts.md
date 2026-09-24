---
source: src/modules/products/tests/unit/validation-messages.test.ts
sha256: edd7dd5dd2ef2d12abaef8dfb1db48f3543f17ea8be32e59eff4038a64058ca1
generated_at: 2026-09-23T19:31:17.664335+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/tests/unit/validation-messages.test.ts

## Purpose

Verifies that the products module's Zod schemas emit locale-specific validation copy (Italian) instead of Zod's built-in default messages. It exists to guard the i18n wiring for the catalogue schema and its thunks, ensuring translation keys are resolved at parse time.

## Key elements

- **`copy(locale)`** — Internal helper. Reads `mergedResources()[locale].translation.products` to fetch the product-namespace translation strings for a given locale. Used to assert expected messages without hard-coding them.
- **`describe('product validation messages')`** — Single test that:
  - Loads `zodProductCreateSchema` from `@modules/products/model` via `loadBeforeI18n('it', …, 'products.field-title-min')`.
  - Calls `safeParse` with intentionally invalid input (`title: 'ab'`, `price: -1`).
  - Asserts `result.success` is `false` and that the emitted messages contain the Italian values for keys `field-title-min` and `field-price-min`.

## Relationships

- **`tests/support/i18n-boot.ts`** — Provides `loadBeforeI18n` (initialises the i18n runtime with a specific locale before importing the module under test) and `mergedResources` (exposes the fully merged translation catalogue for assertion purposes). The entire test depends on this setup; without it the i18n context would not be active.
- **`@modules/products/model`** — The SUT. Exports `zodProductCreateSchema`, the Zod schema whose `.parse`/`.safeParse` output the test inspects.

## Notes

- The test intentionally does **not** hard-code the expected Italian strings; it reads them from `mergedResources` via the `copy` helper. This keeps the test valid even if the copy text changes, as long as the key is still wired.
- The module doc-comment points to `modules/users` as the canonical reference for the i18n-over-Zod pattern; this file is a targeted regression test for the products schema specifically.
- `loadBeforeI18n` is called *before* the dynamic `import('@modules/products/model')`, ensuring the schema is constructed in a context where the locale is already active.
