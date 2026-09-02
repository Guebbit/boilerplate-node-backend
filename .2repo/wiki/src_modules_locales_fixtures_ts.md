# src/modules/locales/fixtures.ts

## Purpose

Factory functions for building locale (language) and locale-entry (translated-string) fixtures that are byte-stable and schema-faithful. They exist so that `demo-data.json` and integration tests can produce documents identical to what the API would create, without re-implementing derivation logic or leaking fixture-specific guesses into the dataset.

## Key elements

- **`makeLocale(fields: LocaleOverrides): LocaleFixture`** — Builds a language document ready for `localeRepository.create`. Requires `_id` and `tag`. Derives `baseLanguage` via `deriveBaseLanguage(tag)` (same path as `createLanguage`) and sets `name`/`nativeName` to the tag. Spreads remaining overrides through `stripUndefined`.
- **`makeLocaleEntry(fields: LocaleEntryOverrides): LocaleEntryFixture`** — Builds one translated-string document ready for `localeMessageRepository.create`. Requires `_id`, `locale`, and `key`. All other fields are optional overrides passed through `stripUndefined`.
- **`LocaleOverrides` / `LocaleEntryOverrides`** — Input types extending the generic `OverridesFor<T>` with the required identifying fields (`tag` or `locale` + `key`).
- **`LocaleFixture` / `LocaleEntryFixture`** — Output types: `Partial<LocaleDocument>` / `Partial<LocaleMessageDocument>` with the required id and addressing fields pinned as non-optional.

## Relationships

- **`src/infrastructure/persistence/fixtures.ts`** — Imports `identityOf` (generates `_id`, `createdAt`, `updatedAt`), `stripUndefined` (drops `undefined` keys), and the generic `OverridesFor<T>` type used in both override interfaces.
- **`src/modules/locales/model.ts`** — Imports `deriveBaseLanguage` (used by `makeLocale`) and the document types `LocaleDocument` / `LocaleMessageDocument` (shape the fixture output types).
- **`src/types/index.ts`** — Imports `Language` and `LocaleEntry` type aliases, which parameterize `OverridesFor` and document the domain shape.
- **`src/modules/locales/demo.ts`** — Consumes `makeLocale` / `makeLocaleEntry` to assemble the `demo-data.json` export.
- **`src/modules/locales/tests/integration/model.test.ts`** / **`repository.test.ts`** — Use the factories to construct known-state documents before asserting model or repository behavior.

## Notes

- `makeLocale` sets `name` and `nativeName` to the BCP-47 `tag` value, then spreads `...fields` which can override them. This means a caller *can* supply a different `name`, but the default mirrors the tag.
- `baseLanguage` is always derived from `tag` inside the factory; a caller-supplied `baseLanguage` in `fields` will override it because of spread order. This is intentional (documented in the inline comment) but easy to trip over.
- The `tag` field is lowercased by the Mongoose schema on write, so fixtures may use any case; the exported `demo-data.json` will contain whatever case was stated at fixture time, not the post-write value.
- Both factories rely on `stripUndefined`, so passing `undefined` for an optional field is equivalent to omitting it — the key simply won't appear in the output object.
