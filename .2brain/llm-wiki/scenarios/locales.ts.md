---
source: scenarios/locales.ts
source_sha256: 1558e0816708c4b480c71c2c4ccb1a0df00130e03b6b7033e5e00fe06ec36a09
context_sha256: cb69f85c77b1c693b67659fcd7069cfd4d8cf1704d4e24845109060d920ab8c0
generated_at: 2026-11-22T01:44:06.315642+00:00
model: claude-code:claude-sonnet-5-5
---

# scenarios/locales.ts

## Purpose
Defines the dynamic locale tier's slice of the demo dataset: five languages and sixteen translated entries, chosen so that every state a language and its entries can be in is represented. It also supplies this module's seed function and one demo-history step. Rows are inserted directly, so `revision` is stated explicitly instead of being bumped by the repository.

## Key elements
- `SEED_LOCALE_TAGS` (internal) names each language by what it demonstrates:
  - `source`: the deployment's fallback locale, from `getFallbackLocale()`.
  - `downloadable`: `es`, which exists only as rows.
  - `answerable`: `it`, which has a deployed file and is also registered here.
  - `draft`: `fr`.
  - `empty`: `ja`.
- `localeFixtures` holds the five languages, built with `makeLocale`:
  - English: the fallback, with no entries and the default revision.
  - Spanish: active.
  - French: inactive, but has entries.
  - Italian: active, and the only one with a deployed API file.
  - Japanese: inactive and empty.
- `LOCALE_ENTRIES` (internal) is a list of `[id, locale, app, key, value]` rows in groups:
  - Ten Spanish frontend entries, including a deep key (`static-pages.about.features.catalogue.title`).
  - Two Spanish backend entries, which are stored but not applied.
  - Two Italian backend entries, which override deployed strings.
  - Two French draft entries.
- `localeEntryFixtures` maps those rows through `makeLocaleEntry`, resolving the tag via `SEED_LOCALE_TAGS` and the app via `backendApp()` or `frontendApp()`.
- `seedLocalesCollection` (internal) inserts all languages first and then all entries, using `insertIfAbsent`. It returns the combined `SeedOutcome[]`.
- `driveLocaleEntryEdit` (internal) sends a `PUT` through the `Caller` to `/locales/it/apps/<backend>/entries/<id>`. This overrides the Italian "unauthorized" string so the audit trail shows a wording edit.
- `shopModule` (the export that wires the above together) is `{ seed, baseline: true, driveHistoryEdit }`.

## Relationships
- `@scenarios/seed` provides `insertIfAbsent` and `SeedOutcome`.
- `./flows/client` provides the `Caller` type used by `driveLocaleEntryEdit`.
- `@modules/locales/factories` provides `makeLocale` and `makeLocaleEntry`.
- `@modules/locales/apps` provides `backendApp` and `frontendApp`.
- `@modules/locales/repository` provides `localeRepository` and `localeEntryRepository`, the seeding targets.
- `@infrastructure/i18n` provides `getFallbackLocale`.
- `shopModule` is collected into `shopModules` (`./shop-modules`, generated via `npm run regenerate`) and run by `seedShop`. `driveHistoryEdit` is called from there rather than hardcoded into the history flow.
- The comments say `./products` depends on the fallback language being active, because `planTranslations` validates each product's fallback-locale `translations` row against it.
- The comments tie the fixtures to `mergeCapabilities` and `applyLocaleOverrides` behavior.

## Notes
- Languages must be seeded before entries. Otherwise a dictionary could be published that the manifest doesn't list.
- `baseline: true` means the `blank` scenario seeds this module too, because a spec that creates its own product still needs the fallback language active.
- Entry ids are fixed per group and not derived. Each group has its own hex band (`f1xxx`, `f2xxx`, `f3xxx`).
- The Spanish backend entries are deliberately stored but skipped, because Spanish has no deployed dictionary. The Italian ones apply because the API has a deployed Italian dictionary file.
- The frontend and backend entries use the same keys without colliding, which shows that apps are separate keyspaces.
- Deleting this file removes its seed and history step together.
