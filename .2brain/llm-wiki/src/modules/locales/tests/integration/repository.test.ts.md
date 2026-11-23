---
source: src/modules/locales/tests/integration/repository.test.ts
source_sha256: a7bd66dc058d0bfc4f6ac250363e3d8bbfed892802d2b40bbd4fd28c1b4866b6
context_sha256: 9870db181cd83382859fc2e7fd6ea6ec8cf5bec068e454113ed14f7fcaad00de
generated_at: 2026-11-22T05:50:39.076724+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/locales/tests/integration/repository.test.ts

## Purpose
Integration tests for the locales module's write paths, run against a real Mongo database (via `setupTestDb`). They cover properties an in-memory fake would satisfy trivially: the revision counter moving with each write, cascades across collections, and an import's effect on rows it wasn't given. No HTTP or auth is involved.

## Key elements
- **`setupTestDb()`**: called at module top level to provision the test database.
- **`FALLBACK`**: constant `'en'`, the deployment's fallback locale in the test environment.
- **`givenLanguage(tag, entries?, overrides?)`**: creates a locale via `makeLocale` and optionally seeds frontend entries via `makeLocaleEntry`.
- **`givenEntry(locale, app, key, value)`**: inserts one entry directly through the repository, bypassing the service so the app is exactly what the test specifies.
- **`valuesOf(tag)`**: returns a `Map` of key to value for a language's frontend entries.
- **`revisionOf(tag)`**: reads the stored revision, or `-1` if the language isn't found.
- **`failNextBump()`**: spies on `localeModel.findOneAndUpdate` to throw once, simulating a failed counter bump.
- **Test groups**:
  - *An entry write and its bump are one transaction*: when the bump fails, `createEntry`, `saveEntryValue` and `removeEntry` each leave the data unchanged (no new row, old value kept, row kept).
  - *The revision counter*: each write path (add, edit, remove, import) is asserted separately. An import bumps once for the whole batch. Repeated identical edits or imports, reads (`readMessages`, `searchEntries`), and writes to other languages don't move it.
  - *`importEntries`*:
    - Counts created, updated and removed rows.
    - `replace: true` deletes keys the body didn't name; `replace: false` keeps them.
    - An empty replace empties the language.
    - Only the given language is touched.
    - The upsert plus removal roll back together if `localeEntryModel.deleteMany` throws.
  - *Deleting a language*: uses `localeService.removeLanguage`. It checks that an active language and its entries are deleted and that the result is `{ removedEntries, removedTranslations }`. The visible content ends partway through this group.

## Relationships
- `src/modules/locales/repository.ts`: the subject under test (`localeRepository`, `localeEntryRepository`, `translationRepository`).
- `src/modules/locales/factories.ts`: `makeLocale` and `makeLocaleEntry` build the fixture data.
- `src/modules/locales/model.ts`: `localeModel` and `localeEntryModel` are spied on to inject failures. `LocaleDocument` is imported as a type.
- `src/modules/locales/services/index.ts`: `localeService` is used for reads (`readMessages`, `searchEntries`) and for `removeLanguage`, so the service-level behaviour is checked alongside the repository.
- `src/modules/locales/tests/unit/apps.fixture.ts`: supplies the `BACKEND` and `FRONTEND` app identifiers.
- `tests/support/setup-test-db.ts` (imported as `@tests/setup-test-db`): provides the Mongo lifecycle.

## Notes
- Failure injection uses `jest.spyOn(...).mockImplementationOnce`. The transaction describe block restores mocks in `afterEach`; the `importEntries` rollback test spies on `deleteMany` but has no local restore, and the file's visible part shows no global restore for it.
- Each revision-counter write path is asserted separately on purpose, because a path that forgot to bump would go unnoticed elsewhere.
- Freshly created languages start at revision 0, so the first write is expected to produce revision 1.
- The `replace: true` and `replace: false` tests are deliberately a pair, since either alone would pass against an implementation that ignores the flag.
- An empty replace import wipes a language. The comments say this is why the route is guarded by an admin token and an audit record instead of a confirmation step.
