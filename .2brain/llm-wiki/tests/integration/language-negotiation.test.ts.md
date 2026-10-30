---
source: tests/integration/language-negotiation.test.ts
sha256: 51972a49950382e35f67172afb931e65f4d3c7fd3f0a7f3fc3d0d879ed51df2b
generated_at: 2026-10-29T06:58:39.818289+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/language-negotiation.test.ts

## Purpose

Integration test that verifies the entire stack (frontend-facing API responses, `Content-Language` header, search, API error wording, signup records, and admin toggle) consistently honours whichever language is currently active for a request. It exercises two scenarios: a language that exists **only** as DB rows (Spanish, no deployed dictionary file) and a language that **has** a deployed dictionary file but is deactivated by an admin (Italian). It lives at the top-level `tests/integration/` rather than inside a module directory because it is inherently cross-module (locales × products × account).

## Key elements

- **`givenSpanishProduct(englishTitle, spanishTitle)`** – Registers the `es` locale, creates a product, upserts its Spanish translation via `translationRepository`, and calls `refreshLocaleOverrides()` so the runtime override cache picks it up (simulating the refresh timer).
- **`ENGLISH_NOT_FOUND`** – Resolves the English `products.not-found` message once at module scope, used to assert that API error text falls back to the default language per-key when the requested language has no file.
- **`describe` block: "a language that exists only as database rows"** – Seven tests covering: correct product title in `es`, `Content-Language: es` header, English fallback for API messages, search by Spanish term, signup saving `locale: 'es'`, no cross-language bleed on repeated GETs, and admin deactivate/reactivate toggles (including instant pickup on locale creation without waiting for the timer).
- **`describe` block: "a language with a deployed file that an admin switches off"** – Two tests: after deactivation the response reverts to English, and the dictionary endpoint returns 404 for the deactivated locale.
- **`describe` block: "an admin and a language that is switched off"** – One test: an authenticated admin requesting `es` as their **primary** language still gets Spanish (admin override), while a request with `en, es;q=0.5` falls back to English.
- **Lifecycle hooks** – `beforeAll` registers `localeService.readLocaleOverlay` as the override provider; `afterEach` calls `resetLocaleOverrides()`; `afterAll` unregisters the provider.

## Relationships

- **`@infrastructure/i18n` (index, context, overrides)** – Imports `translator`, `refreshLocaleOverrides`, `registerLocaleOverrideProvider`, `resetLocaleOverrides`. The test wires the real locale-service overlay into the i18n runtime and exercises the override-cache invalidation path on each admin toggle.
- **`src/modules/locales/repository.ts`** – Calls `translationRepository.upsertEntityLocale` to insert per-locale product translations.
- **`src/modules/locales/services/index.ts`** – Passes `localeService.readLocaleOverlay` into the override provider registration.
- **`src/modules/locales/tests/factories.ts`** – `givenLocale` creates the locale row (and optionally sets `active: false`).
- **`src/modules/products/tests/factories.ts`** – `createProduct` creates the product under test.
- **`src/modules/users/model.ts`** – `userModel.findOne` reads the saved account to assert `locale` was persisted.
- **`src/modules/users/tests/factories.ts`** – `PLAIN_PASSWORD` constant for the signup payload.
- **`tests/support/contract.ts`** – Imported as a side-effect to configure the API contract/serialisation under test.
- **`tests/support/http.ts`** – Provides `api()` (supertest-style client) and `authenticateAs` for admin bearer tokens.
- **`tests/support/setup-test-db.ts`** – `setupTestDb()` initialises the in-memory test database before any test runs.

## Notes

- The file deliberately uses **Spanish** (no dictionary file) to prove the fallback-per-key path works when the API's own messages can't be localised, and **Italian** (has a file) to prove that a deployed dictionary does not grant immunity once an admin deactivates the locale.
- `refreshLocaleOverrides()` is called manually in `givenSpanishProduct` to simulate the production refresh timer; tests for admin-created locales (the "without a wait for the timer" case) skip this call to verify the server-side activation path pushes the override immediately.
- The admin override test (`Accept-Language: es` vs `en, es;q=0.5`) documents a non-obvious rule: an admin's **primary** language is honoured even when deactivated, but a lower-q value is not.
- All DB writes go through the real repository/service layer (not mocks), so this file is a genuine end-to-end integration test, not a unit test.
