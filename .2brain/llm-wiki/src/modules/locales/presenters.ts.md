---
source: src/modules/locales/presenters.ts
sha256: 194b235668c51bc5948c9541db76936ff018556cd32e7aa9d85b3a19d78ec3c2
generated_at: 2026-10-15T10:44:16.741965+00:00
model: ollama:qwen3.8:27b
---

# src/modules/locales/presenters.ts

## Purpose

Thin presentation layer that converts locale and locale-entry database documents into their wire (API response) shapes. It exists because the model types (`LocaleDocument`, `LocaleEntryDocument`) carry stored representation (`_id`, native dates), while the public types (`Language`, `LocaleEntry`) expect `id` and ISO date strings. The two presenters bridge that gap by calling the model's `.toJSON()` transform and casting to the wire type.

## Key elements

- **`presentLocale(document: LocaleDocument): Language`** — Calls `document.toJSON()` (which performs `_id` → `id` and date-to-ISO-string) and casts the result to `Language`. Used when a single locale document needs to be returned as an API payload.
- **`presentLocaleEntry(document: LocaleEntryDocument): LocaleEntry`** — Same transform/cast for a single locale-entry document. Used when a single entry write/read needs to produce a wire shape (as opposed to `services/entries.ts`'s `search()`, which already returns `LocaleEntry` directly from the repository's lean transform).

## Relationships

- **`./model.ts`** — Provides the input types (`LocaleDocument`, `LocaleEntryDocument`) whose `.toJSON()` method performs the actual field mapping.
- **`@types` (`src/types/index.ts`)** — Provides the output types (`Language`, `LocaleEntry`) that represent the API wire contract.
- **`controllers/create-locale.ts`** — Imports `presentLocale` to shape the response after a new locale is persisted.
- **`controllers/update-locale.ts`** — Imports `presentLocale` to shape the response after an update.
- **`controllers/write-locale-entries.ts`** — Imports `presentLocaleEntry` to shape the response after a single-entry write.

## Notes

- Both presenters are essentially `doc.toJSON() as T`; the only work is the type cast. The real transformation logic lives on the model's `.toJSON()`.
- The module docstring notes that the search/list path in `services/entries.ts` does **not** go through these presenters — it returns `LocaleEntry` directly. These presenters are only for single-document read/write paths.
