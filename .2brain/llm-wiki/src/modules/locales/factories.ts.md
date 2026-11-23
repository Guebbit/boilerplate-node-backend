---
source: src/modules/locales/factories.ts
source_sha256: fe6cad19d729b8a7d1c8ce8ec99ed83aa65ca0f53af8e500a1daa86b7ff5f02b
context_sha256: 39be3992e2b7dd6df20f6fab9f8d3d108204d6f404dcce45be9d36f95695031c
generated_at: 2026-11-22T05:44:40.079587+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/locales/factories.ts

## Purpose
Test/seed fixture builders for the locales module. It provides two factories, one for a language row and one for a translated-entry row. Both pin an `_id`, because `insertIfAbsent`/`upsertById` key their idempotency on it. Fields a factory doesn't set fall through to the schema `default:` values in `./model`, so seeded data reflects the schema rather than the factory's own guesses.

## Key elements
- `makeLocale(overrides)`: builds a `LocaleFixture`.
  - `tag` is required.
  - `name` and `nativeName` default to the tag.
  - `baseLanguage` is derived with `deriveBaseLanguage(tag)`.
  - Remaining fields are spread in after `stripUndefined`.
  - `id`, `createdAt` and `updatedAt` go through `identityOf`.
- `makeLocaleEntry(overrides)`: builds a `LocaleEntryFixture`. It needs `locale` and `key`, passes identity fields through `identityOf`, and spreads the other fields after `stripUndefined`.
- `LocaleOverrides`: `OverridesFor<Language>` plus a required `tag` (BCP 47; the schema lowercases it on write).
- `LocaleEntryOverrides`: `OverridesFor<LocaleEntry>` plus required `locale` and `key`.
- `LocaleFixture` / `LocaleEntryFixture`: `Partial<…Document>` types with `_id` (an `ObjectId`) and the identifying fields required. They are meant for `localeRepository.create` and `localeEntryRepository.create`.

## Relationships
- `@infrastructure/persistence/factories` (`src/infrastructure/persistence/factories.ts`): supplies `identityOf` (builds the `_id` and timestamps from `id`, `createdAt` and `updatedAt`) and the `OverridesFor` type.
- `@infrastructure/object-guards` (`src/infrastructure/object-guards.ts`): supplies `stripUndefined`, so undefined overrides don't clobber defaults.
- `./model`: supplies `deriveBaseLanguage` and the `LocaleDocument` / `LocaleEntryDocument` types.
- `@types` (`src/types/index.ts`): supplies the `Language` and `LocaleEntry` domain types that the overrides are based on.
- Test and scenario files (`src/modules/locales/tests/factories.ts`, the integration tests `model.test.ts`, `repository.test.ts` and `update-audit.test.ts` under `src/modules/locales/tests/integration/`, and `scenarios/locales.ts`) are graph neighbors of this module. They are presumably the consumers of these factories.

## Notes
- `baseLanguage` is derived on purpose, the same way `createLanguage` derives it. This stops a fixture from creating data the API could never produce. Because `fields` is spread last, an explicit `baseLanguage` override would still win.
- A language is addressed by its pinned `_id`. An entry is addressed by the pair `(locale, key)`, yet it still gets an `_id`.
