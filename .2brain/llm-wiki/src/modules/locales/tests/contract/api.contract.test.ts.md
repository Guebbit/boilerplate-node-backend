---
source: src/modules/locales/tests/contract/api.contract.test.ts
sha256: 23cad1f0051e5b819c6ec46a4c2cdbbbfc60c19ba305bdc52b392aa81b953b14
generated_at: 2026-11-08T06:27:12.479437+00:00
model: ollama:qwen3.8:27b
---

# src/modules/locales/tests/contract/api.contract.test.ts

## Purpose
Contract tests for the `/locales` API surface. The central invariant guarded is the **two-tier distinction**: languages shipped as static deployment files are *answerable* (the API can serve error messages in them), while languages registered only in the database are merely *downloadable* (clients can pull their message dictionaries). The tests assert that a DB-only language never makes the dictionary endpoint answer for it, that the manifest's shape matches `listSupportedLocales()`, and that merging a language present in both tiers produces a single unified row. The file exists so a future change collapsing the two tiers fails here rather than surfacing in a client.

## Key elements
- **`createEntry(bearer, tag, key, value, app?)`** — local helper; POSTs one translation entry through the real route and returns the new entry id. Used to seed state for messages/revision assertions.
- **`tags(response)`** — local helper; extracts the array of locale tags from a manifest response body.
- **`describe('GET /locales')`** — asserts the public manifest lists every deployed language, reports DB-only languages as `source: 'dynamic'`, merges dual-tier languages into one row (`source: 'both'`), exposes `entryCount`/`revision`, hides inactive languages from unauthenticated callers, and exposes them only to API keys holding `display:Locale`.
- **`describe('GET /locales/:locale/dictionary')`** — asserts the endpoint serves the API's own i18next bundle (shared + module namespaces), 404s for undeployed locales, 404s for DB-only locales (tier boundary), and rejects path-traversal attempts (`..%2F..%2Fpackage`, `%2Fetc%2Fpasswd`, `en.json`) with 404.
- **`describe('GET /locales/:locale')`** — asserts single-language detail matches the list shape, `POST → Location` round-trip works, static-only locales expose `actions: {…false}` with no `id`/`createdAt`, and inactive registered languages are hidden from visitors but visible to staff.
- **`describe('GET /locales/:locale/messages')`** — asserts the client-mergeable message tree, revision stamp, empty-dictionary case, and public accessibility.

## Relationships
- **`@infrastructure/i18n`** (`index.ts` → `catalog.ts`, `context.ts`): imports `listSupportedLocales`, `getDefaultLocale`, `getFallbackLocale` (expected manifest values) and `translator` (used indirectly to confirm module-contributed namespaces appear in the dictionary response).
- **`./support`** (`support.ts`): provides `createLanguage` (creates a DB row via the real API) and the `PORTUGUESE` payload constant.
- **`tests/support/http.ts`**: supplies `api` (supertest wrapper), `authenticateAs`, `authenticateAsRole`.
- **`tests/support/credentials.ts`**: supplies `credentialHolding` to mint a scoped API key for the `display:Locale` visibility test.
- **`tests/support/setup-test-db.ts`**: `setupTestDb()` resets/creates the test database before each run.
- **`tests/support/contract.ts`**: side-effect import that registers the shared contract-testing setup (response schema validation, problem+json assertions).
- **`tests/support/ids.ts`**: exports `MISSING_ID` (imported here for reference in edge-case assertions).
- **`tests/unit/scripts/contracts/root-assembly.test.ts`**: a sibling contract test in the same family; shares conventions for how contract suites are structured and run.

## Notes
- The file imports `'@tests/contract'` for its side effects (global contract expectations) — it is not a named import.
- The tier-boundary test for `GET /locales/:locale/dictionary` is the load-bearing assertion: if a future refactor sources the API dictionary from the DB, this test fails before any client notices.
- Path-traversal cases are encoded (`%2F`) because Express normalises literal `..` before routing; the test documents that the supported-locale allowlist is the actual guard, not middleware.
- `itTranslation` is imported from `../../../../../shared/locales/it.json` to assert the dictionary response contains at least the shared bundle's keys; module-contributed keys are asserted by count (`> 0`) rather than by name since the set of modules is not known at test-authoring time.
- The `createEntry` helper hard-codes `app = 'demo-fe'` as the default, matching the app name the manifest test expects for DB-only languages.
