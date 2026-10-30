---
source: src/modules/locales/presenters.ts
sha256: 82f931482ad6b795230ee77f18f962d9ce05386d6f945f20bf72c4855addc6ae
generated_at: 2026-10-29T04:21:55.766759+00:00
model: ollama:qwen3.8:27b
---

# src/modules/locales/presenters.ts

## Purpose

Provides the single presentation step that converts a stored `LocaleEntryDocument` into its wire-shape `LocaleEntry` (the `_id` → `id` rename and date → ISO-string mapping). It exists because the repository returns documents in their stored shape, and a single-document write path needs the wire shape before handing data to the client. Languages and list-search do not need a presenter: the language wire shape is built by `localeService.describeStoredLanguage`, and `search()` already returns `LocaleEntry` via the repository's lean transform.

## Key elements

- **`presentLocaleEntry(document: LocaleEntryDocument): LocaleEntry`** — Calls `document.toJSON()` (which performs the `_id` → `id` and date-to-ISO-string transforms defined on the model) and casts the result to `LocaleEntry`. This is the file's sole export.

## Relationships

- **`./model` (`src/modules/locales/model.ts`)** — Supplies the `LocaleEntryDocument` type; its `toJSON()` method is what actually performs the field/date transformations this presenter delegates to.
- **`src/types/index.ts`** — Supplies the `LocaleEntry` type that `presentLocaleEntry` returns.
- **`src/modules/locales/controllers/write-locale-entries.ts`** — The stated consumer: "only a single-document write needs the cast this presenter replaces."
- **`src/modules/locales/controllers/get-locale-entries.ts`** — Does **not** use this presenter; its `search()` path already returns `LocaleEntry` directly from the repository.

## Notes

- The cast `as LocaleEntry` is a type-level assertion only; the actual shape transformation is done inside `document.toJSON()`. If the model's `toJSON` contract changes, the cast will silently mismatch the real output.
- This file intentionally contains no logic of its own. If you find yourself adding transforms here, they probably belong in `LocaleEntryDocument.toJSON()`.
