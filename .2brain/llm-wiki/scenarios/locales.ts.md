---
source: scenarios/locales.ts
sha256: 94aa979b03d697f7ce1abbd295378d8e41fd4fbcb3b5ffc6ff020c2dc437554e
generated_at: 2026-10-14T06:59:17.099437+00:00
model: ollama:qwen3.8:27b
---

# scenarios/locales.ts

## Purpose

Seeds the dynamic-locale tier of the demo dataset with five languages (English, Spanish, Italian, French, Japanese) chosen to cover every state a locale and its entries can occupy — active/inactive, with/without entries, with/without a deployed file. It also contributes one audit-trail step (a wording override on Italian) to the shop-history flow.

## Key elements

- **`SEED_LOCALE_TAGS`** — Maps semantic roles (`source`, `downloadable`, `answerable`, `draft`, `empty`) to concrete locale tags. `source` is resolved via `getFallbackLocale()`; the others are hard-coded (`es`, `it`, `fr`, `ja`).
- **`localeFixtures`** (exported) — Five `makeLocale` objects. English carries no explicit revision (deployed-file default); Spanish and Italian have `revision: 1`; French is `active: false`; Japanese is `active: false` with no entries.
- **`LOCALE_ENTRIES` / `localeEntryFixtures`** (exported) — 16 `makeLocaleEntry` rows grouped by what they demonstrate: Spanish frontend keys against real `en.json` declarations (including a 5-level-nested key), Spanish backend keys that are stored-but-not-applied, Italian backend keys that *do* override a deployed file, and two French frontend rows proving `active: false` hides real content.
- **`seedLocalesCollection`** (exported) — Inserts all locale rows then entry rows via `insertIfAbsent`. Languages are inserted first so entries never reference a missing locale tag. Returns combined `SeedOutcome[]`.
- **`driveLocaleEntryEdit`** (exported) — Calls `PUT /locales/it/apps/backend/entries/…3101` with an updated Italian string, producing an audit-trail entry alongside the catalogue price edit from the shop-history flow.

## Relationships

- **`src/modules/locales/factories.ts`** — Provides `makeLocale` and `makeLocaleEntry` used to build every fixture object.
- **`src/modules/locales/repository.ts`** — Provides `localeRepository` and `localeEntryRepository`, the targets of `insertIfAbsent` calls inside `seedLocalesCollection`.
- **`src/modules/locales/apps.ts`** — Provides `frontendApp()` and `backendApp()` used to set the `app` field on entries and in the `driveLocaleEntryEdit` URL.
- **`src/infrastructure/i18n/index.ts`** — Supplies `getFallbackLocale()` to resolve the `source` tag at module-load time.
- **`scenarios/seed.ts`** — Supplies `insertIfAbsent` and the `SeedOutcome` type used by `seedLocalesCollection`.
- **`scenarios/shop-modules.ts`** — Declares `seedLocalesCollection` in its `shopModules.locales` block and wires `driveLocaleEntryEdit` into the history-drive step; `seedShop` walks that declaration.
- **`scenarios/flows/client.ts`** — Provides the `Caller` type accepted by `driveLocaleEntryEdit`, which uses it to issue the override request.
- **`tests/cross-cutting/scenario-fixtures.test.ts`** — Consumes the exported fixtures to assert structural invariants across scenario data.

## Notes

- The `source` locale's tag is **not** hard-coded; it comes from `getFallbackLocale()`. Changing the deployment's fallback locale automatically re-points this fixture.
- `revision` is set explicitly on every non-default locale because these rows bypass the repository's auto-bump. Omitting it (as English does) means "use the model default."
- Entry IDs are deliberately in distinct hex bands per group (`…1001`, `…3001`, `…3101`, `…2001`) so they are recognisable in logs and assertions without being sequential.
- `driveLocaleEntryEdit` targets the **Italian backend** entry specifically because Italian is the only locale with both a stored dynamic row *and* a deployed file — making the write a true override rather than a new-key insertion.
- Languages are seeded before entries to guarantee referential integrity: an entry names its locale by tag, and inserting an entry before its locale would leave a dangling reference in the manifest.
