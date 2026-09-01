# src/modules/locales/tests/contract/api.contract.test.ts

## Purpose

Contract tests for the `/locales` REST endpoints across all four routes (`GET /locales`, `GET /locales/:locale`, `GET /locales/:locale/messages`, `POST /locales`). Beyond standard OpenAPI shape validation, the file explicitly guards the two-tier locale model: a language that exists only in the database must be *downloadable* (its message tree is served) but **not answerable** (the API's own copy must still 404). The assertions are written so that a future change collapsing those two tiers fails here before it reaches a client.

## Key elements

- **`createLanguage(bearer, body?)`** – helper that POSTs to `/locales` via the real route; returns the new tag. Throws on non-201.
- **`createEntry(bearer, tag, key, value, tenant?)`** – helper that POSTs a single translation entry under a locale; returns the entry id.
- **`MISSING_ID`** – a valid-shape ObjectId guaranteed absent, used to exercise the 404 branch (not 422) in ID-based lookups.
- **`PORTUGUESE`** – the default language fixture (`{ tag: 'pt', name: 'Portuguese', nativeName: 'Português' }`) used by most write-path tests.
- **`describe('GET /locales')`** – asserts the manifest shape, that deployed languages carry `demo-be` tenant, that DB-only languages appear with `source: 'dynamic'` and only `demo-fe`, that a language in both tiers merges to one row with `source: 'both'`, entry counts, revision numbers, inactive-language hiding, and public (unauthenticated) access.
- **`describe('GET /locales/:locale')`** – asserts the served dictionary contains both the shared half (matched against `itTranslation`) and module-contributed namespaces; 404s for unsupported or DB-only locales; path-traversal guard (`..%2F`, `%2Fetc%2Fpasswd`, `en.json`).
- **`describe('GET /locales/:locale/messages')`** – asserts the nested message tree shape, revision number, empty-dictionary response, public access, and 404 for inactive or unknown locales.
- **`describe('POST /locales')`** – asserts 201 on success, 409 on duplicate tag, 422 on invalid tag format, and a whitespace-only tag edge case (fuzz-discovered 500 regression).

## Relationships

- **`tests/support/contract.ts`** – imported as a side-effect (`@tests/contract`); registers the `toSatisfyApiSpec()` Jest matcher used in nearly every assertion to validate responses against `openapi.yaml`.
- **`tests/support/http.ts`** – provides the `api()` supertest wrapper and `authenticateAs()` helper used for all HTTP calls in this file.
- **`tests/support/setup-test-db.ts`** – `setupTestDb()` is called once at module level to provision an isolated database before any test runs.
- **`src/infrastructure/i18n/index.ts`** → **`src/infrastructure/i18n/catalog.ts`** – re-exports `listSupportedLocales`, `getDefaultLocale`, `getFallbackLocale`, and `readLocaleDictionary`, which the tests use as the *source of truth* to cross-check against the API's JSON responses (e.g., the manifest's locale list must equal `listSupportedLocales()`).

## Notes

- The file deliberately imports `itTranslation` from a raw JSON file (`../../../../locales/it.json`) rather than through the i18n runtime, so the "shared half" assertion is independent of any runtime caching or merge logic.
- The path-traversal test uses *encoded* sequences (`%2F`) because Express normalises literal `..` out of the URL before routing; a raw `..` would never reach the handler.
- The `entryCount` / `revision` assertions on `GET /locales` are the only place the test pins the *numeric* metadata fields; the OpenAPI spec check alone cannot guarantee they are correct.
- Every read endpoint is asserted public (no `Authorization` header); if a route ever gains an auth guard, the "is public" tests will fail first.
