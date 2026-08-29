# src/modules/locales/demo.ts

## Purpose

Seeds the demo dataset for the dynamic (database-backed) locale tier. Each of the four languages (`es`, `it`, `fr`, `ja`) is chosen to exercise a specific branch of the locale module — downloadable-only, file+row merge, inactive-but-populated, and registered-empty — so that every code path the module owns has at least one fixture driving it.

## Key elements

- **`SEED_LOCALE_TAGS`** — `as const` object mapping semantic roles (`downloadable`, `answerable`, `draft`, `empty`) to language tags (`es`, `it`, `fr`, `ja`). Used throughout the file and importable by consumers/tests to reference languages by intent rather than by tag string.
- **`localeFixtures`** — Four locale documents built via `makeLocale`. Spanish and Italian are active; French and Japanese are `active: false`. Revision is set to `1` for the three languages that carry entries; Japanese omits it to preserve the schema default of `0`.
- **`localeEntryFixtures`** — Array of entry rows (built via `makeLocaleEntry`) spanning both tenants, four namespaces, and up to three key levels (`products.list.filters.*`). Includes the Spanish backend pair (stored but skipped by `applyLocaleOverrides`) and the Italian backend pair (overrides real keys in `src/locales/it.json`).
- **Seeding infrastructure** — Imports `upsertById`, `SeedOutcome`, and `exportCollection` from `@infrastructure/persistence/seed` to write directly to Mongo, and imports `localeModel` / `localeMessageModel` for the raw collection handles.

## Relationships

- **`./factory.ts`** — Source of `makeLocale` and `makeLocaleEntry`; the sole constructor for every fixture in this file.
- **`./tenants.ts`** — Provides `backendTenant()` and `frontendTenant()` used to stamp each entry's tenant identity.
- **`./model.ts`** — Supplies the Mongoose models (`localeModel`, `localeMessageModel`) that the seed writes target directly.
- **`./repository.ts`** — Imported (`localeRepository`, `localeMessageRepository`) but deliberately bypassed: the seed writes to Mongo directly so it controls `revision` and avoids the repository's auto-bump.
- **`@infrastructure/persistence/seed.ts`** — Provides `upsertById` (upsert helper), the `SeedOutcome` type, and `exportCollection` (for dumping the seeded state).
- **`tests/unit/service.test.ts`** — Consumes `SEED_LOCALE_TAGS`, `localeFixtures`, and `localeEntryFixtures` as its data preconditions.

## Notes

- `en` is **intentionally absent** from this file. It serves as the static-only language that has no database rows, which is the condition `mergeCapabilities` needs to produce a `source: 'file'` entry.
- The Spanish backend rows (`generic.*`) are valid, stored, and **never applied** because `applyLocaleOverrides` refuses to register a bundle for a language with no deployed file. They exist solely to exercise that skip-and-log branch.
- The Italian backend rows use the **same two keys** as the Spanish pair on purpose; the only difference between the two sets is file deployment, making the contrast a one-line diff for a reader.
- Keys reach three levels deep (`products.list.filters.reset`) so the tree builder is tested with a non-flat shape.
- `revision` is hard-coded to `1` (not left at the schema default) because the direct Mongo write skips the repository call that would otherwise increment it.
