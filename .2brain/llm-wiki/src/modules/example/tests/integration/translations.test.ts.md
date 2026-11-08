---
source: src/modules/example/tests/integration/translations.test.ts
sha256: aae1c1b04bb3855b98b17534e19b6ab9fa3179b3146d64341047a4ffeaf8f945
generated_at: 2026-11-08T05:55:36.512358+00:00
model: ollama:qwen3.8:27b
---

# src/modules/example/tests/integration/translations.test.ts

## Purpose

End-to-end integration test that exercises the full translation lifecycle for the **example** module's `title` field. It verifies that writing a translation through `/locales/translations` correctly copies the fallback language onto the row, stores non-fallback languages separately, rejects undeclared fields, and that the i18n override layer resolves the right language on single-item and list reads—including staff-only preview of an inactive language.

## Key elements

- **`registerLanguage`** – POSTs a new language row to `/locales` via the real HTTP route (required because a translation slot needs a persisted `locales` record).
- **`adminWithLanguages`** – Authenticates an admin and registers both `en` (fallback) and `it`, returning the bearer token.
- **`publishedWithItalian(italianActive)`** – Creates a published example, attaches an Italian translation, optionally deactivates Italian, then calls `refreshLocaleOverrides()`. Returns `{ id, bearer }`.
- **Suite: "translating an example's title through /locales"** (4 tests)
  - Fallback-language write copies the value onto the row's own `title`.
  - Non-fallback write stores the translation but leaves the row untouched.
  - A field not declared translatable by the module → **422**.
  - Non-existent example ID → **404**.
- **Suite: "reading an example in the request's language"** (3 tests)
  - Active language resolved for any caller via `Accept-Language`.
  - Inactive language preview: staff sees the translated title with `content-language: it` and `cache-control: private, no-store`; a visitor falls back to English.
  - List endpoint (`GET /examples`) also resolves the translated title.
- **Lifecycle hooks** – `setupTestDb()` (before suite), `registerLocaleOverrideProvider` / `resetLocaleOverrides` (beforeAll / afterEach), `registerLocaleOverrideProvider(undefined)` (afterAll).

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/infrastructure/i18n/index.ts` | Source of `refreshLocaleOverrides`, `registerLocaleOverrideProvider`, `resetLocaleOverrides` used in lifecycle hooks and the `publishedWithItalian` helper. |
| `src/modules/locales/index.ts` | Provides `localeService`, whose `readLocaleOverlay()` method is wired in as the override provider. |
| `src/modules/locales/services/index.ts` | Underlying implementation of the locale service that backs the `/locales` routes exercised by these tests. |
| `src/modules/example/tests/factories.ts` | Supplies `createExample` (row creation) and `fieldOf` (row-field assertion helper). |
| `src/types/index.ts` | Supplies the `ExampleStatus` enum used to set `published` status. |
| `tests/support/http.ts` | Supplies the `api()` supertest wrapper and `authenticateAs` used for every HTTP call. |
| `tests/support/setup-test-db.ts` | Supplies `setupTestDb` which resets the database before the suite runs. |

## Notes

- All HTTP calls go through **real routes** (supertest against the app), not mocked service calls—this is an integration test by design.
- `registerLanguage` must use the real `POST /locales` route because the translation machinery validates that a corresponding `locales` row exists; seeding one directly in the DB would bypass that check.
- The staff-preview test asserts **both** response headers (`content-language` and `cache-control`), so a regression that strips either will fail here.
- `publishedWithItalian(false)` deactivates Italian *before* creating the translation, so the override is intentionally "stale" relative to the language's active state—this is what exercises the staff-preview path.
