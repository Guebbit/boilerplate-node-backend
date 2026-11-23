---
source: src/modules/locales/presenters.ts
source_sha256: abc05d9f8a9cbf7dce9b7d5e54fde57c7ea8eb938451cc9df350ba8c278c1e76
context_sha256: 44d2c92ed73d1828e14d5f269e2f62a45645d118bcca9e3b8e377d5106cc6a42
generated_at: 2026-11-22T05:45:54.281041+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/locales/presenters.ts

## Purpose
Converts a locale entry document into its wire shape (`LocaleEntry`) for single-document write responses. Stored documents are typed as stored, not as the API contract promises, so this presenter centralizes the conversion instead of scattering casts.

## Key elements
- `presentLocaleEntry(document: LocaleEntryDocument): LocaleEntry` — calls `document.toJSON()` and casts the result to `LocaleEntry`. The model's `toJSON` transform maps `_id` to `id` and dates to ISO strings.

## Relationships
- `src/modules/locales/model.ts` — supplies the `LocaleEntryDocument` type and, by its `toJSON` transform, the actual conversion.
- `src/types/index.ts` (`@types`) — supplies the `LocaleEntry` wire type.
- `src/modules/locales/controllers/get-locale-entries.ts`, `src/modules/locales/controllers/post-locale-entry.ts`, `src/modules/locales/controllers/put-locale-entry.ts` — neighbors in the dependency graph. The module doc says only single-document writes need this presenter, so the post and put controllers are the likely consumers. The file does not show how any controller uses it.

## Notes
- The `as LocaleEntry` cast is not checked by the compiler. The doc comment says `toJSON` leaves no date or id object (`serialize.ts`) and that contract tests check the rest.
- Languages have no presenter. `localeService.describeStoredLanguage` builds their wire shape, which merges both tiers.
- `src/modules/locales/services/entries.ts`'s `search()` already returns `LocaleEntry` from the repository's lean transform, so it does not use this presenter.
