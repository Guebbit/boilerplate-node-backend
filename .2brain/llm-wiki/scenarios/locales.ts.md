---
source: scenarios/locales.ts
sha256: 1f1d497b7cd06001efb05645bfc17701e9aefb120dbe774b1f6c647de6aa3e6c
generated_at: 2026-09-23T17:18:47.110564+00:00
model: ollama:qwen3.8:27b
---

# scenarios/locales.ts

## Purpose

Seeds the dynamic-locale tier of the demo dataset with five languages, each chosen to exercise a distinct state (source, downloadable, answerable, draft, empty), along with sixteen locale entries that demonstrate tenant separation, active/inactive visibility, and file-overlay merging. It exists so integration and cross-cutting tests have a deterministic, state-complete locale catalogue without hitting a live API.

## Key elements

- **`SEED_LOCALE_TAGS`** — A `const` object mapping semantic names (`source`, `downloadable`, `answerable`, `draft`, `empty`) to BCP-47 tags. `source` is resolved at runtime via `getFallbackLocale()`; the rest are hardcoded tags.
- **`localeFixtures`** — Exported array of five `Locale` objects (built via `makeLocale`) covering: the fallback locale (no revision, no entries), a rows-only language, an inactive language with entries, a file-and-rows language, and a registered-but-empty inactive language.
- **`LOCALE_ENTRIES`** — Internal typed tuple array (`LocaleEntryRow`) of sixteen translated strings grouped by what they demonstrate (frontend Spanish, backend Spanish, backend Italian overlay, draft French).
- **`localeEntryFixtures`** — Exported array of `LocaleEntry` objects, mapped from `LOCALE_ENTRIES` via `makeLocaleEntry`. Tenant is resolved through `backendTenant()` or `frontendTenant()`.
- **`seedLocalesCollection`** — Exported async function that inserts all locales then all entries via `insertIfAbsent` against `localeRepository` / `localeEntryRepository`. Returns a combined `SeedOutcome[]`.

## Relationships

- **`scenarios/seed.ts`** — Provides `insertIfAbsent` (upsert-by-id helper) and the `SeedOutcome` return type used by `seedLocalesCollection`.
- **`scenarios/index.ts`** — Declares `seedLocalesCollection` in its `shopModules` registry; `seedShop` walks that list to run the seed.
- **`src/modules/locales/factories.ts`** — Supplies `makeLocale` and `makeLocaleEntry`, the object constructors used to build every fixture row.
- **`src/modules/locales/repository.ts`** — Supplies `localeRepository` and `localeEntryRepository`, the persistence targets `insertIfAbsent` writes through.
- **`src/modules/locales/tenants.ts`** — Supplies `backendTenant` and `frontendTenant` for resolving tenant IDs on each entry.
- **`src/infrastructure/i18n/index.ts`** — Supplies `getFallbackLocale()`, which determines the `source` tag at module load time.

## Notes

- `revision` is set explicitly on most locales because these fixtures bypass the repository path that would normally increment it. The `source` locale intentionally omits it (defaults to `0`) since its dictionary lives in a deployed file, not in rows.
- Entry IDs are hand-assigned in non-contiguous hex bands per group (e.g. `…1001–…100a`, `…3001–…3002`, `…3101–…3102`, `…2001–…2002`); they are not sequential across groups.
- The Spanish (`downloadable`) frontend entries use keys that exist in the actual `en.json` locale files, so a future deployed `es.json` would slot them in without key drift. The five-level-deep key `static-pages.about.features.catalogue.title` is intentional to catch builders that only nest once.
- `draft` (French) is `active: false` *and* has entries — the fixture specifically tests "inactive hides a non-empty dictionary" rather than "empty language shows nothing."
- The `empty` (Japanese) locale is `active: false` with zero entries, covering the zero-entry edge case (cascade delete of zero rows, `entryCount = 0`).
- Seed order matters: languages are inserted before entries because an entry references its language by tag, and publishing entries before their language would produce an inconsistent manifest.
