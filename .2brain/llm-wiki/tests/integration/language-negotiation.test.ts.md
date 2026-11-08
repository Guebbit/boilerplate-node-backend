---
source: tests/integration/language-negotiation.test.ts
sha256: 51972a49950382e35f67172afb931e65f4d3c7fd3f0a7f3fc3d0d879ed51df2b
generated_at: 2026-11-08T09:42:18.607794+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/language-negotiation.test.ts

## Purpose

Integration test that drives real HTTP routes with `Accept-Language` headers and asserts every layer (product text, search results, `Content-Language` header, API error messages, signup locale, admin toggling) agrees on the language a request is answered in. It covers two scenarios — a language that exists only as database rows (Spanish, no deployed dictionary file) and a deployed-but-deactivated language (Italian) — to verify negotiation, fallback, and admin on/off behavior end-to-end.

## Key elements

- **`givenSpanishProduct(title, spanishTitle)`** — Registers Spanish via `givenLocale('es')`, creates a product, upserts a Spanish title via `translationRepository.upsertEntityLocale`, then calls `refreshLocaleOverrides()`. Returns the product id.
- **`ENGLISH_NOT_FOUND`** — Pre-resolved English translation of `products.not-found`, used to assert that API error messages fall back to the default language key-by-key.
- **`beforeAll` / `afterEach` / `afterAll`** — Registers a locale-override provider that delegates to `localeService.readLocaleOverlay()` (simulating the production refresh timer), resets overrides after each test, and unregisters the provider at the end.
- **`describe('a language that exists only as database rows')`** — 8 tests: serving localized product text, `Content-Language` label, API messages in default language, search by localized word, signup saving the locale, no cross-language contamination, admin deactivate/activate round-trip, and immediate availability after admin creation (no timer wait).
- **`describe('a language with a deployed file that an admin switches off')`** — 2 tests: Italian (with a real dictionary file) is served before deactivation and falls back to English after; its dictionary endpoint returns 404 when deactivated.
- **`describe('an admin and a language that is switched off')`** — 1 test: an authenticated admin still receives the deactivated language when it is the primary `Accept-Language` value, but gets the default language when it appears only with a `q` weight behind another.

## Relationships

- **`tests/support/http.ts`** — Provides `api()` (supertest instance) and `authenticateAs()` used for every HTTP request and admin auth.
- **`tests/support/contract.ts`** — Imported as a side-effect for global test matchers/contracts.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` prepares the test database before the suite runs.
- **`src/infrastructure/i18n/index.ts`** — Re-exported source of `refreshLocaleOverrides`, `registerLocaleOverrideProvider`, `resetLocaleOverrides`, and `translator`.
- **`src/infrastructure/i18n/overrides.ts`** — Underlying implementation of the override register/refresh/reset functions the test manipulates.
- **`src/infrastructure/i18n/context.ts`** — Source of `translator`, used to pre-resolve the English 404 string.
- **`src/modules/locales/repository.ts`** — `translationRepository.upsertEntityLocale` writes per-locale product titles into the DB.
- **`src/modules/locales/services/index.ts`** — `localeService.readLocaleOverlay()` feeds the override provider registered in `beforeAll`.
- **`src/modules/locales/tests/factories.ts`** — `givenLocale` creates locale records in the test DB.
- **`src/modules/products/tests/factories.ts`** — `createProduct` creates a product fixture.
- **`src/modules/users/tests/factories.ts`** — `PLAIN_PASSWORD` constant for the signup test.
- **`src/modules/users/model.ts`** — `userModel` is queried directly to assert the locale a signup stored.

## Notes

- The file lives in `tests/integration/` rather than inside a module's `tests/` folder because it is intentionally cross-module (locales + products + account).
- Spanish has **no deployed dictionary file**; this is deliberate so that API error messages must fall back key-by-key to the default language rather than loading a file.
- `refreshLocaleOverrides()` inside the helper simulates what the production refresh timer would do; the "without a wait for the timer" test verifies that admin creation triggers the refresh synchronously.
- The `upsertEntityLocale` calls pass `'human'` (author) and `'digest'` (scope/mode) as positional arguments — these are conventions of the repository API, not configurable in the test.
