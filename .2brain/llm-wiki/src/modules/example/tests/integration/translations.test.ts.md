---
source: src/modules/example/tests/integration/translations.test.ts
sha256: aae1c1b04bb3855b98b17534e19b6ab9fa3179b3146d64341047a4ffeaf8f945
generated_at: 2026-10-29T03:58:00.829823+00:00
model: ollama:qwen3.8:27b
---

# src/modules/example/tests/integration/translations.test.ts

## Purpose

End-to-end integration test proving that the **example** module is a translatable entity through the `locales` door: writing a translation via `PATCH /locales/translations/example/:id` copies the fallback-language title onto the row (what lists display), stores non-fallback titles in the overlay, rejects undeclared fields, and that `GET /examples/:id` (and the list) resolves the title from the request's `Accept-Language` header — including the staff-only preview path for deactivated languages.

## Key elements

- **`registerLanguage(bearer, language)`** – posts a new language row to `POST /locales`; needed because a translation slot requires a real locale row.
- **`adminWithLanguages()`** – signs in as admin and registers both `en` (fallback) and `it`; returns the admin's bearer token.
- **`publishedWithItalian(italianActive)`** – creates a published example, writes an Italian title translation, optionally deactivates `it`, then calls `refreshLocaleOverrides()` so the in-memory overlay is current.
- **`describe("translating an example's title through /locales")`** – four cases: fallback copy-to-row, non-fallback stored without mutating the row, 422 for an undeclared field (`body`), 404 for a missing entity id.
- **`describe("reading an example in the request's language")`** – three cases: active language resolved for anonymous users, deactivated language previewed only for staff (with `private, no-store` and `content-language` headers), and title resolution on the list endpoint.
- **Lifecycle hooks** – `beforeAll` registers the locale-override provider from `localeService.readLocaleOverlay()`; `afterEach` calls `resetLocaleOverrides()`; `afterAll` unregisters the provider.

## Relationships

- **`tests/support/setup-test-db.ts`** – calls `setupTestDb()` at module load to provision a clean database per test run.
- **`tests/support/http.ts`** – provides the `api()` supertest wrapper and `authenticateAs('admin')` used for every request and auth setup.
- **`src/types/index.ts`** – imports `ExampleStatus.published` to create a visible example.
- **`src/modules/locales/index.ts`** – imports `localeService` to feed `readLocaleOverlay()` into the i18n override provider.
- **`src/infrastructure/i18n/index.ts`** – imports `refreshLocaleOverrides`, `registerLocaleOverrideProvider`, `resetLocaleOverrides` to wire up and tear down the in-memory translation overlay between tests.
- **`src/modules/example/tests/factories.ts`** – imports `createExample` (seed data) and `fieldOf` (assert on the row's stored title after a write).

## Notes

- The test **does not** mock the locales service or the i18n layer; it exercises the real HTTP routes and the real override provider, so it is a true integration test.
- Fallback-language writes are expected to **mutate the row** (`title` column), while non-fallback writes only land in the overlay. Assertions on `fieldOf` vs. `response.body.translations` reflect this split.
- The staff-preview case checks `cache-control: private, no-store` and `content-language: it` on the response — these are contract details a caching proxy or CDN would need to honour.
- `resetLocaleOverrides()` runs in `afterEach` to prevent stale overlay state leaking between tests; forgetting this would cause later tests to see leftover translations.
