---
source: tests/integration/translation-resolution.test.ts
sha256: dd766d60510d624c3b2b7fa8086fed9904166c721dd8362f59e4d6e9e03a4316
generated_at: 2026-09-27T15:59:03.670067+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/translation-resolution.test.ts

## Purpose

Integration test verifying that product reads resolve titles in the caller's negotiated language (via `Accept-Language`). It covers single-product fetch, whole-page batched resolution, and free-text / `title=` search — confirming that translated, untranslated, and region-tagged cases all behave correctly against the live API. Because the test spans the `products` read path and the `locales` data ownership, it lives at the top-level `tests/` rather than under either module.

## Key elements

- **`FALLBACK`** — constant `'en'`, the fallback locale for every environment this suite runs in.
- **`givenTranslation(productId, locale, title)`** — local helper that seeds a translation row via `translationRepository.upsertEntityLocale`; marks non-fallback rows with a `'digest'` provenance tag.
- **`describe('GET /products/:id resolves to the caller's language')`** — single-product resolution: exact locale match, fallback when no translation row exists, and region-tag (`it-CH` → `it`) resolution.
- **`describe('GET /products resolves a whole page in one batched query')`** — list endpoint: all items translated, and mixed translated/untranslated items on the same page without blanking.
- **`describe('free-text search follows the caller's locale')`** — `?text=` and `?title=` filters: matches via translation column, falls back to own column, unions (not intersects) both match sources, excludes non-matching rows, and mirrors the union behavior for the `title=` parameter.

## Relationships

- **`src/modules/locales/repository.ts`** — imports `translationRepository` to upsert entity-locale rows used as seed data.
- **`src/modules/locales/tests/factories.ts`** — imports `givenLocale` to register a locale (e.g. `'it'`) before translating.
- **`src/modules/products/tests/factories.ts`** — imports `createProduct` to seed product documents.
- **`tests/support/contract.ts`** — imported as a side-effect module (`import '@tests/contract'`) to establish shared test contract/expectations.
- **`tests/support/http.ts`** — imports `api()` to drive requests through the real HTTP layer.
- **`tests/support/setup-test-db.ts`** — calls `setupTestDb()` at module load to provision an isolated database per run.

## Notes

- Tests exercise the **public HTTP API** (not in-process calls), so they validate serialization, routing, and query composition end-to-end.
- `FALLBACK` is hardcoded to `'en'` and is documented as guaranteed by `.env-example`; if the fallback locale changes in an environment, these assertions will silently mis-attribute rows.
- The search union behavior (own-column OR translation-column) is an intentional design choice asserted here; a future refactor to intersection would break the "unions rather than intersects" test.
- `setupTestDb()` is called at module scope (not inside `beforeAll`), so DB setup runs before any test file in the worker has loaded its other imports.
