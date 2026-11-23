---
source: src/modules/example/tests/integration/translations.test.ts
source_sha256: 66140eeaa781920cb8270b3e93e08a7b219aed8aa5f10afe564c23e52312cc21
context_sha256: 2e790b3222bf2f6aa86549978eb768210f6725fe1a6bf7db45a71cfb327b21fb
generated_at: 2026-11-22T05:14:29.465524+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/example/tests/integration/translations.test.ts

## Purpose
Integration tests for translating the example module's `title` through the `locales` module. They exercise the flow end to end over HTTP: the example module is registered as a translatable entity type, a fallback-language (`en`) write is copied onto the row itself, and a write in another language leaves the row untouched. They also check that reads resolve the title in the request's language.

## Key elements
- **Setup hooks**: `setupTestDb()` provides the test database. `beforeAll` registers a locale override provider backed by `localeService.readLocaleOverlay()`. `afterEach` calls `resetLocaleOverrides()`. `afterAll` unregisters the provider.
- **`registerLanguage(bearer, language)`**: POSTs to `/locales` through the real route, because a translation slot needs a real `locales` row.
- **`adminWithLanguages()`**: authenticates as `admin` and registers `en` (the fallback) and `it`. It returns the admin's `user` and `bearer`.
- **`publishedWithItalian(italianActive)`**: builds a published example titled "Hello" with an Italian "Ciao" translation. If `italianActive` is false it first deactivates `it`. It then calls `refreshLocaleOverrides()` and returns `{ id, bearer }`.
- **`describe('translating an example's title through /locales')`**: tests `PATCH /locales/translations/example/:id` and covers these cases:
  - An `en` write updates the row's title.
  - An `it` write is stored in the response's `translations` and leaves the row title unchanged.
  - A field the module did not declare translatable (`body`) returns 422.
  - A parameterised case (`it.each`) returns 422 for a cleared title in `en` or `it`, a title over 200 characters, and a whitespace-only title. Each response has `errors[0].details` equal to `{ field: '<locale>.title' }`, and the row stays unchanged.
  - The title is stored trimmed.
  - An unknown example id returns 404.
- **`describe('reading an example in the request's language')`**: tests `GET /examples/:id` and `GET /examples` with `Accept-Language`. It covers three behaviours:
  - An active language resolves the translated title for anyone.
  - A draft (inactive) language is previewed by staff with `Content-Language: it` and `Cache-Control: private, no-store`. A visitor gets the fallback title and `Content-Language: en`.
  - The list endpoint also resolves the title.

## Relationships
- `@tests/setup-test-db` (`tests/support/setup-test-db.ts`): `setupTestDb` sets up the DB.
- `@tests/http` (`tests/support/http.ts`): `api()` and `authenticateAs()` drive the HTTP calls and the admin login.
- `../factories` (`src/modules/example/tests/factories.ts`): `createExample` and `fieldOf` create examples and read the stored field directly.
- `@modules/locales` (`src/modules/locales/index.ts`): its `localeService` is used to feed the override provider. The `/locales` routes under test belong to this module.
- `@infrastructure/i18n` (`src/infrastructure/i18n/index.ts`): provides `registerLocaleOverrideProvider`, `refreshLocaleOverrides` and `resetLocaleOverrides`.
- `@types` (`src/types/index.ts`): imported by the tests to mark an example as published.

## Notes
- The override provider is registered once per file and the overrides are reset after each test. Tests that read a translated title must call `refreshLocaleOverrides()`, which `publishedWithItalian` does.
- The 422 tests and the trim test show that the locales door applies the same validation and trimming as the example's own door.
