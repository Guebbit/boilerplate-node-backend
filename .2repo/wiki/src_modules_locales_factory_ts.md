# src/modules/locales/factory.ts

## Purpose

Builds fixture objects for the two locale collections (language records and translated entries) used by demo seeding and integration tests. The factories pin ids for byte-stable output and deliberately omit any field the schema can derive, so the resulting dataset records what the schema *does* rather than what a fixture assumed it should.

## Key elements

- **`LocaleOverrides`** — `OverridesFor<Language>` plus a required `tag: string` (BCP 47 code).
- **`LocaleFixture`** — A `Partial<LocaleDocument>` with `_id` and `tag` promoted to required fields, ready for `localeRepository.create`.
- **`makeLocale(overrides)`** — Spreads `identityOf`, sets `name`/`nativeName` to the tag, derives `baseLanguage` via `deriveBaseLanguage`, then applies `compact` over the remaining fields.
- **`LocaleEntryOverrides`** — `OverridesFor<LocaleEntry>` plus required `locale` and `key` (the composite addressing pair).
- **`LocaleEntryFixture`** — A `Partial<LocaleMessageDocument>` with `_id`, `locale`, and `key` required, ready for `localeMessageRepository.create`.
- **`makeLocaleEntry(overrides)`** — Spreads `identityOf`, then `compact` over the remaining fields.

## Relationships

- **`src/infrastructure/persistence/factory.ts`** — Source of `identityOf`, `compact`, and the `OverridesFor<T>` generic. The file's header docstring points there for the determinism rationale behind pinning ids.
- **`src/modules/locales/model.ts`** — Provides `deriveBaseLanguage` (used inside `makeLocale`) and the `LocaleDocument` / `LocaleMessageDocument` types. Any field the factories leave unset falls through to the model's `default:` values.
- **`src/types/index.ts`** — Supplies the `Language` and `LocaleEntry` interfaces that `OverridesFor<T>` is parameterised on.
- **`src/modules/locales/demo.ts`** — Consumes the fixtures to produce `db/demo/demo-data.json`.
- **`src/modules/locales/tests/integration/*.test.ts`** — Use `makeLocale` / `makeLocaleEntry` to build deterministic test data.

## Notes

- `baseLanguage` is **always** derived from the tag and never taken from the overrides. The comment explains this prevents publishing a dataset the live API could never produce.
- `name` and `nativeName` are set to the raw `tag` string inside `makeLocale`; a caller cannot override them through the spread because `compact` runs after those assignments.
- `tag` is lowercased by the Mongoose schema on write, so a fixture may legitimately use mixed case (e.g. `"en-GB"`); the stored value will be normalised.
- The two factories exist separately because the collections have different addressing semantics: a language is addressed by its `_id`, while an entry is addressed by the `(locale, key)` pair. The file header treats this as a domain fact, not an implementation choice.
