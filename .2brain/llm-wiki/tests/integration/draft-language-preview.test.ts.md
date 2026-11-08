---
source: tests/integration/draft-language-preview.test.ts
sha256: 6ec056a2d7b8672001c246765d54fe552508c839d648917583298b3df43ae397
generated_at: 2026-11-08T09:38:13.253455+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/draft-language-preview.test.ts

## Purpose

Integration tests proving that a staff credential holding only `display:Locale` (without `display:Product`) can preview a draft locale's product text, and that this preview **bypasses the shared Redis cache in both directions** — never reading from it, never writing to it — so visitors are never contaminated. The suite also guards against vacuous passage via an explicit canary test that confirms the cache double *would* have shared the entry.

## Key elements

- **`jest.mock('@infrastructure/adapters/cache')`** — In-memory Redis double with tag-aware `getCacheValue`, `setCacheValue`, `invalidateCacheTags`, plus test-only handles `storedValues()` and `clearStored()`.
- **`givenDraftGerman(fields?)`** — Creates an `en` live product, an inactive `de` locale, upserts a draft German translation row (default title `Hundekorb`), and refreshes locale overrides.
- **`READS`** — Constant array of the three catalogue endpoints (`GET /products`, `POST /products/search`, `GET /products/:id`), each with a `read` thunk and a `titleOf` extractor; consumed by `it.each`.
- **`asking(language, bearer?)`** — Builds the `Accept-Language` + optional `Authorization` header object.
- **`describe('a staff credential…')`** — The main block: canary (cache *would* share), per-endpoint uncached read + visitor integrity, cold-cache first-read, field-by-field fallback, conditional-request 200 (never 304), draft-only text searchability, and live-language fallback when draft isn't first preference.
- **`describe('everyone else…')`** — Anonymous visitors and `customer`-role callers receive the live title, `content-language: en`, and the shared cache.
- **`describe('the oracle')`** — After activating the draft locale via `POST /locales/de/activate`, a visitor's response body is deep-equal to the preview body (correctness oracle).

## Relationships

- **`tests/support/setup-test-db.ts`** — `setupTestDb()` initialises the in-memory DB before all tests.
- **`tests/support/http.ts`** — `api()`, `authenticateAs`, `authenticateAsRole` provide the HTTP client and role-based bearer tokens used in every test.
- **`tests/support/credentials.ts`** — `credentialHolding(['display:Locale'])` mints the minimal staff token under test.
- **`src/modules/products/tests/factories.ts`** — `createProduct` seeds the live English product row.
- **`src/modules/locales/tests/factories.ts`** — `givenLocale` creates the `en` (active) and `de` (inactive) locale rows.
- **`src/modules/locales/repository.ts`** — `translationRepository.upsertEntityLocale` writes the draft German translation.
- **`src/modules/locales/services/index.ts`** — `localeService.readLocaleOverlay` is registered as the i18n override provider in `beforeAll`.
- **`src/infrastructure/i18n/index.ts`** — Exports `refreshLocaleOverrides`, `registerLocaleOverrideProvider`, `resetLocaleOverrides` used in lifecycle hooks.
- **`src/infrastructure/i18n/overrides.ts`** — Underlying store the i18n index delegates to; exercised indirectly via the overlay provider registration.

## Notes

- The mock factory is defined **before** imports so that the module registry sees the double first; `jest.requireMock` retrieves the test-only handles after import.
- `cacheDouble.clearStored()` runs in `beforeEach`; assertions on `storedValues()` are the only way to prove the draft text never entered the cache.
- The canary test (first `it`) is not a production assertion — it exists solely to fail if the cache double is broken, preventing the suite from passing vacuously.
- `credentialHolding(['display:Locale'])` deliberately omits `display:Product`, which is what pushes the request into the anonymous catalogue scope where `scopeKey` would otherwise share the Redis entry.
- The oracle test (`describe('the oracle')`) mutates global state (activates `de`) after all other tests; it relies on `afterEach` clearing overrides and the DB being reset per test.
