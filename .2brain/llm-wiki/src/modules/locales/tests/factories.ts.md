---
source: src/modules/locales/tests/factories.ts
sha256: e509b3c8966f2dfe757431c1d354b7a7feef7a222b4966977d9221f51fcb4d57
generated_at: 2026-09-27T15:02:38.295568+00:00
model: ollama:qwen3.8:27b
---

# src/modules/locales/tests/factories.ts

## Purpose

Test-persistence layer for locale fixtures. It wraps the pure builder (`makeLocale`) from the production factories module with a single `repository.create` call so that integration tests get a real row in the test database without repeating that two-step pattern.

## Key elements

- **`givenLocale(tag, overrides?)`** — The sole export. Accepts a BCP-47 tag string and an optional `{ active?: boolean }` override. Builds a `LocaleDocument` via `makeLocale` (setting `name` and `nativeName` to the tag by default) and persists it through `localeRepository.create`. Returns `Promise<LocaleDocument>`.

## Relationships

- **`src/modules/locales/factories.ts`** — Imports `makeLocale`, the pure builder that constructs the in-memory locale object. This file deliberately does *not* re-implement construction logic; it delegates entirely to that builder.
- **`src/modules/locales/model.ts`** — Imports the `LocaleDocument` type, which is the return type of `givenLocale`.
- **`src/modules/locales/repository.ts`** — Imports `localeRepository` and calls its `create` method to write the built document into the test database.
- **Integration test files** (`translations.test.ts`, `order-snapshot-locale.test.ts`, `product-write.test.ts`, `translation-resolution.test.ts`) — Downstream consumers that call `givenLocale` to seed locale rows before exercising locale-scoped behavior.

## Notes

- The `active` flag on `overrides` is the only documented non-tag field. Tests that need to exercise "disabled locale is skipped" logic pass `{ active: false }` to get a row that exists but is not active.
- `name` and `nativeName` are hard-set to the tag. If a test ever needs a distinct display name, it cannot use this helper and must call `makeLocale` + `localeRepository.create` directly.
- This is a **module without a default export**; import the named `givenLocale` only.
