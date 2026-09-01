# src/modules/locales/fixtures.ts

## Purpose

Factory functions that build fully-shaped `Language` and `LocaleEntry` documents for seeding, testing, and the `demo-data.json` export. Two separate factories exist because the collections are addressed differently (language by pinned `_id`; entry by `(locale, key)`), but both pin an id for byte-stable output. Any field a fixture omits falls through to the model's `default:` values, keeping the exported dataset a record of the schema rather than of fixture guesses.

## Key elements

- **`makeLocale`** — Builds a `LocaleFixture` from a `LocaleOverrides` object. Requires `id` and `tag`. Sets `name` and `nativeName` to the tag, computes `baseLanguage` via `deriveBaseLanguage(tag)`, and spreads the remaining (compacted) overrides on top.
- **`makeLocaleEntry`** — Builds a `LocaleEntryFixture` from a `LocaleEntryOverrides` object. Requires `id`, `locale`, and `key`. Spreads the remaining (compacted) overrides on top.
- **`LocaleOverrides`** — `OverridesFor<Language>` plus a required `tag: string` (BCP-47, case-insensitive since the schema lowercases on write).
- **`LocaleFixture`** — `Partial<LocaleDocument>` with required `_id: Types.ObjectId` and `tag: string`.
- **`LocaleEntryOverrides`** — `OverridesFor<LocaleEntry>` plus required `locale: string` and `key: string`.
- **`LocaleEntryFixture`** — `Partial<LocaleMessageDocument>` with required `_id`, `locale`, and `key`.

## Relationships

- **`src/infrastructure/persistence/fixtures.ts`** — Supplies the shared primitives `identityOf` (generates `_id`/timestamps), `compact` (strips undefined keys), and the `OverridesFor<T>` type helper.
- **`src/modules/locales/model.ts`** — Provides `deriveBaseLanguage` (used by `makeLocale` to compute `baseLanguage` identically to `createLanguage`) and the `LocaleDocument` / `LocaleMessageDocument` types that shape the returned fixtures.
- **`src/types/index.ts`** — Source of the `Language` and `LocaleEntry` domain types used in the `OverridesFor<…>` generics.
- **`src/modules/locales/demo.ts`** — Consumer: calls `makeLocale` / `makeLocaleEntry` to assemble the `demo-data.json` export.
- **`src/modules/locales/tests/integration/repository.test.ts`** — Consumer: builds fixture documents to seed the repository under test.
- **`src/modules/locales/tests/integration/model.test.ts`** — Consumer: builds fixture documents for model-level integration assertions.

## Notes

- `baseLanguage` is **not** overridable; it is always derived from `tag` via `deriveBaseLanguage`. Stating it explicitly in overrides would be shadowed by the later spread, but the type system doesn't even expose it as an optional field on `LocaleOverrides`.
- `name` and `nativeName` default to the `tag` value inside `makeLocale`; pass explicit values via the `fields` spread to override.
- `compact` removes `undefined` entries before spreading, so passing `{ name: undefined }` in overrides silently falls back to the computed default rather than writing `undefined` into the document.
- The BCP-47 `tag` may be mixed-case in a fixture; the Mongoose schema normalises it to lowercase on write, so tests should compare against the lowercased form.
