---
source: scenarios/locales.ts
sha256: d4b328bd3ac5ad8c02d20ab7210f7accbc892e24c0498d74006f0d17d9ff3bef
generated_at: 2026-10-29T01:23:48.970573+00:00
model: ollama:qwen3.8:27b
---

# scenarios/locales.ts

## Purpose

Seed data for the dynamic-locale tier of the shop demo dataset. Defines five languages (each chosen to exercise a distinct state in the locale model) and sixteen translated entries across two apps, then exposes a seeding routine and a single history-edit step that plug into the `shopModules` fixture table.

## Key elements

- **`SEED_LOCALE_TAGS`** — constant mapping semantic role names (`source`, `downloadable`, `answerable`, `draft`, `empty`) to their locale tags. `source` is resolved at runtime via `getFallbackLocale()`.
- **`localeFixtures`** — array of five locale objects (built with `makeLocale`) representing the five states: source/fallback, downloadable-only, deployed+registered, inactive-with-entries, and registered-empty.
- **`LOCALE_ENTRIES`** / **`localeEntryFixtures`** — sixteen `[id, locale, app, key, value]` tuples (10 Spanish frontend, 2 Spanish backend, 2 Italian backend, 2 French frontend) mapped into locale-entry objects via `makeLocaleEntry`.
- **`seedLocalesCollection`** — async function that inserts all locales then all entries (order matters: entries reference their locale by tag) using `insertIfAbsent` against the two repositories.
- **`driveLocaleEntryEdit`** — PUTs a new Italian backend value for a seeded entry, representing an operator overriding an already-deployed translation. Accepts a `Caller`.
- **`shopModule`** — the module's entry in the shop fixture table: `{ seed, baseline: true, driveHistoryEdit }`. Picked up by `scenarios/shop-modules.generated.ts` during `npm run regenerate`.

## Relationships

- **`src/modules/locales/factories.ts`** — provides `makeLocale` / `makeLocaleEntry` used to build every fixture object.
- **`src/modules/locales/apps.ts`** — provides `backendApp()` / `frontendApp()` used to assign the `app` field on entries.
- **`src/modules/locales/repository.ts`** — provides `localeRepository` / `localeEntryRepository` that `seedLocalesCollection` calls.
- **`src/infrastructure/i18n/index.ts`** — provides `getFallbackLocale()`, which determines the `source` tag at runtime.
- **`scenarios/seed.ts`** — provides `insertIfAbsent` and the `SeedOutcome` type used by the seeding routine.
- **`scenarios/flows/client.ts`** — provides the `Caller` type accepted by `driveLocaleEntryEdit`.
- **`scenarios/shop-modules.generated.ts`** — auto-generated file that imports `shopModule` from this file; deleting this file removes the entry from that generated table.
- **`tests/cross-cutting/scenario-fixtures.test.ts`** / **`src/modules/locales/tests/unit/service.test.ts`** — consume the exported fixtures and seeding logic.

## Notes

- **`revision` is set explicitly** on every locale except `source`. The source locale relies on the model's default because its dictionary lives in a deployed JSON file, not in dynamic rows. All others must state `revision: 1` because they bypass the repository call that would normally bump it.
- **Seeding order is load-bearing**: languages are inserted before entries. Landing an entry before its locale would publish a dictionary the manifest doesn't yet list.
- **IDs are hand-assigned hex bands**, not auto-generated. Each group (downloadable-frontend, downloadable-backend, answerable, draft) occupies its own band and does not run on from the previous one.
- **`baseline: true`** means the locale seed runs even in specs that create their own products, because `planTranslations` requires the fallback language to exist and be active.
- **`driveLocaleEntryEdit` is declared here, not in the flow file**, so deleting this module removes the step along with all its fixtures rather than leaving a dangling `/locales` call in `flows/shop-history.ts`.
