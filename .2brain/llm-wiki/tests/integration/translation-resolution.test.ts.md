---
source: tests/integration/translation-resolution.test.ts
sha256: af0cdd68395210012012f59a4c0a651247f3eee31168e26a5d172b16fddf5153
generated_at: 2026-10-15T12:55:02.066609+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/translation-resolution.test.ts

## Purpose

Integration tests verifying that product reads (single fetch, paginated list, and free-text/title search) resolve titles in the caller's negotiated language, fall back to the source title when no translation exists, and batch all translations in one query. Because the assertion spans the product read path *and* the `locales` module's translation row, the file lives at the top level `tests/integration/` rather than under either module's `tests/` directory.

## Key elements

- **`FALLBACK`** — constant `'en'`, the default fallback locale in every environment this suite targets.
- **`givenTranslation(productId, locale, title)`** — thin wrapper around `translationRepository.upsertEntityLocale` that upserts a product title translation; passes `'digest'` as the source hint for non-fallback locales.
- **`describe('GET /products/:id resolves to the caller's language')`** — single-product resolution: correct locale match, fallback to source title, and region-tag → base-language resolution (`it-CH` → `it`).
- **`describe('GET /products resolves a whole page in one batched query')`** — page-level tests: every item translated in one batch; mixed translated/untranslated items coexist without blanking.
- **`describe('free-text search follows the caller's locale')`** — `text` and `title` query params match against both the product's own column and its translation row (union, not intersection); non-matching products are excluded.

## Relationships

- **`src/modules/locales/repository.ts`** — imports `translationRepository`; the `givenTranslation` helper calls `upsertEntityLocale` to seed translation rows.
- **`src/modules/locales/tests/factories.ts`** — imports `givenLocale` to register a locale (e.g. `'it'`) in the test database before seeding translations.
- **`src/modules/products/tests/factories.ts`** — imports `createProduct` to seed product documents with a source title/description.
- **`tests/support/contract.ts`** — imported as a side-effect to install the shared API response-shape contract (validates `body.data` envelope, status codes, etc.).
- **`tests/support/http.ts`** — imports `api` to issue real HTTP requests against the running test server (`.get`, `.set`, `.query`).
- **`tests/support/setup-test-db.ts`** — imports `setupTestDb`, called once at module scope to provision and reset the test database before any test runs.

## Notes

- The file is intentionally **not** under `src/modules/products/tests/` or `src/modules/locales/tests/`; the header comment explains this is a cross-module concern.
- `en` is hard-coded as the fallback — if a future environment changes the fallback, this constant and the tests relying on it must be updated in tandem (the comment points to `.env-example`).
- The search tests assert a **union** (own-column OR translated) rather than an intersection. A product whose source title happens to be in Italian *and* another whose translation is Italian both match on the same query term.
- Assertions use `toSorted()` (non-mutating) to keep order-independent comparisons deterministic.
- `setupTestDb()` is called at the top level of the module (not inside `beforeAll`), ensuring the DB is ready before any `describe` block evaluates.
