# src/modules/locales/demo.ts

## Purpose

Static seed data for the dynamic locale tier in the demo dataset. Four languages are chosen to cover every distinct state a language and its entries can occupy (downloadable-only, overridable, draft, empty), giving tests and the local demo a realistic but minimal dataset to work against.

## Key elements

- **`SEED_LOCALE_TAGS`** — const object mapping semantic role names (`downloadable`, `answerable`, `draft`, `empty`) to BCP-47 tags (`es`, `it`, `fr`, `ja`). Used as the single source of truth for tag references throughout the file and downstream consumers.
- **`localeFixtures`** — array of four `makeLocale` rows. `es` is the only one with no deployed file; `it` has a deployed counterpart; `fr` is `active: false` with entries; `ja` is `active: false` with zero entries. `revision` is set explicitly because these rows bypass the repository's auto-bump.
- **`localeEntryFixtures`** — 16 `makeLocaleEntry` rows spanning two tenants (`frontendTenant`, `backendTenant`), multiple namespaces, and a three-level-deep key (`products.list.filters.*`). Also includes the Italian backend overlay that overrides a deployed file and the Spanish backend rows that are stored-but-skipped.
- **`seedLocalesCollection`** — async; upserts `localeFixtures` then `localeEntryFixtures` via `upsertById` on their respective repositories. Returns a flat `SeedOutcome[]`. Languages are seeded before entries so a tag reference never lands before its parent.
- **`exportSeededLocales`** — async; reads both collections via `exportCollection` with explicit sort orders (`tag: 1` / `locale, tenant, key`) and returns them as a plain object keyed by collection name. Intended for the `export-demo-dataset.ts` script, not for API responses.

## Relationships

- **`./fixtures`** — provides `makeLocale` and `makeLocaleEntry` factory helpers used to build every row in this file.
- **`./tenants`** — provides `backendTenant()` and `frontendTenant()` so entries are tagged to the correct tenant keyspace.
- **`./model`** — provides `localeModel` and `localeMessageModel` (Mongoose models) used directly by `exportSeededLocales`.
- **`./repository`** — provides `localeRepository` and `localeMessageRepository`, the upsert targets inside `seedLocalesCollection`.
- **`@infrastructure/persistence/seed`** — provides `upsertById`, `SeedOutcome`, and `exportCollection`, the generic seed/export primitives this file composes.
- **`./module.ts`** — declares (re-exports) `seedLocalesCollection` and `exportSeededLocales` for callers outside the locales module.
- **`src/infrastructure/persistence/seed.ts`** — implementation of the upsert/export helpers imported above.
- **`src/modules/locales/tests/unit/service.test.ts`** — consumes `SEED_LOCALE_TAGS` and the fixture arrays to assert on specific language/entry states.

## Notes

- `revision` is hard-coded to `1` on every locale fixture. This is deliberate: the normal write path bumps revision via the repository, but seeding bypasses that, so the value must be stated.
- The Italian (`it`) entries with `backendTenant` are the only ones that actually override a deployed file (`src/locales/it.json`). The Spanish (`es`) backend rows exist to exercise the "stored but skipped" branch of `applyLocaleOverrides`.
- `exportSeededLocales` returns raw stored rows, not the merged/transformed responses an API endpoint would produce. Tests that need the merged view must apply the tier-merge logic themselves.
- The deep key `products.list.filters.reset` (three dot-segments) is intentionally present so that a builder that only nests one level would fail on this dataset.
