---
source: src/modules/example/tests/integration/translations.test.ts
sha256: 66140eeaa781920cb8270b3e93e08a7b219aed8aa5f10afe564c23e52312cc21
generated_at: 2026-11-14T20:01:40.465479+00:00
model: ollama:qwen3.8:27b
---

# src/modules/example/tests/integration/translations.test.ts

## Purpose

Integration tests that exercise the full translation lifecycle for an **example** entity through the real `/locales` HTTP routes. They verify that writing a fallback-language title copies the value onto the row, that a non-fallback language stores a translation slot without touching the row, that invalid payloads are rejected (422) with the row left unchanged, and that reads (single + list) resolve the correct title based on `Accept-Language`, including draft-language preview rules for staff vs. visitors.

## Key elements

- **`registerLanguage(bearer, language)`** — posts a language to `POST /locales` so the translation slot has a real `locales` row behind it.
- **`adminWithLanguages()`** — signs in as admin and registers `en` + `it`; returns the auth context used by every write test.
- **`publishedWithItalian(italianActive)`** — creates a *published* example titled "Hello", patches an Italian translation, optionally deactivates Italian, then calls `refreshLocaleOverrides()` so read tests see a consistent cache.
- **"translating an example's title through /locales" suite** — six tests covering: fallback write copies to row, non-fallback write stores slot only, undeclared field rejected (422), parameterized invalid-title cases (null, 201-char, whitespace-only) rejected with row untouched, trimmed title stored, and 404 for a missing example.
- **"reading an example in the request's language" suite** — three tests covering: active-language resolution for any caller, draft-language preview (staff gets `it` + `cache-control: private, no-store`; visitor falls back to `en`), and list-endpoint title resolution.

## Relationships

- **`src/modules/example/tests/factories.ts`** — provides `createExample` (seed an example row) and `fieldOf` (read a specific field back from the DB after an API call).
- **`src/infrastructure/i18n/index.ts`** — source of `registerLocaleOverrideProvider`, `resetLocaleOverrides`, and `refreshLocaleOverrides`; the test wires the locale-service overlay into the i18n override registry in `beforeAll`/`afterAll` and resets it per-test.
- **`src/modules/locales/index.ts`** — exports `localeService`; the test passes `localeService.readLocaleOverlay()` as the override-provider callback so the i18n layer can resolve per-locale values.
- **`src/types/index.ts`** — provides `ExampleStatus` (used to create a *published* example in the read tests).
- **`tests/support/http.ts`** — provides the `api()` supertest wrapper and `authenticateAs('admin')`.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` runs before the suite to ensure a clean database per run.

## Notes

- Tests hit the **real HTTP routes** (supertest), not in-process service calls. Language registration goes through `POST /locales` because the translation endpoint requires an existing `locales` row; skipping this step would mask the FK/slot check.
- `resetLocaleOverrides()` runs in `afterEach`; forgetting it would let override state leak between tests and cause false positives on reads.
- The 422 validation tests assert the error detail shape (`{ field: "it.title" }`), which couples the test to the exact error-envelope contract.
- Draft-language preview (`italianActive: false`) is only available to authenticated staff; the test asserts `content-language: it` **and** `cache-control: private, no-store` on the staff response to pin both the resolution and the caching policy.
- The 201-char bound in the parameterized test implies a max-length of 200 on `title`; the exact limit lives in the module's validation contract, not in this file.
