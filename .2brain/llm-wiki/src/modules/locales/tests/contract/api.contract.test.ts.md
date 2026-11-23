---
source: src/modules/locales/tests/contract/api.contract.test.ts
source_sha256: b3973ea1e7db43e98ec06e83d42a3e8c411e9eab64582f389d93b19a95af5aef
context_sha256: 647ede9c327f00d79e23125c645a6ed657b2cc14528d1473235802bba2f09050
generated_at: 2026-11-22T05:49:15.294907+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/locales/tests/contract/api.contract.test.ts

## Purpose
Contract tests for the `/locales` HTTP API, covering both tiers of language support and the boundary between them. `openapi.yaml` can only pin the manifest's shape, since which languages are deployed is runtime state. These tests therefore guard the property that a language existing in the database never implies the API can answer in it, so a change that collapses the two tiers fails here instead of in a client.

## Key elements
- `setupTestDb()` is called at module level to prepare the test database.
- `createEntry(bearer, tag, key, value, app = 'demo-fe')` posts to `/locales/:tag/apps/:app/entries` through the real route. It returns the new entry id and throws a descriptive error if the status isn't 201.
- `tags(response)` extracts the language tags from a manifest response.
- `describe('GET /locales')` covers:
  - Every deployed language is listed, matching `listSupportedLocales()`, with `demo-be` among its apps. `default` and `fallback` match `getDefaultLocale()` and `getFallbackLocale()`.
  - A database-only language (`pt`) is listed with `apps: ['demo-fe']` and `source: 'dynamic'`.
  - A language present in both tiers (`it`) merges into one row with `apps: ['demo-be', 'demo-fe']` and `source: 'both'`.
  - `entryCount` and `revision` are reported.
  - An inactive language is hidden from the public list but visible to an API key minted with `display:Locale`.
  - The endpoint is public.
- `describe('GET /locales/:locale/dictionary')` covers:
  - It returns the API's own dictionary: the shared keys from the Italian shared translation file (imported as `itTranslation`) plus extra module-contributed namespaces.
  - It returns 404 `application/problem+json` for unknown locales.
  - It returns 404 for a database-only language, which is the tier boundary stated as a test.
  - It returns 404 for traversal-style inputs (`..%2F..%2Fpackage`, `%2Fetc%2Fpasswd`, and a name with a file extension).
- `describe('GET /locales/:locale')` covers:
  - A registered language is returned in the same shape as the list entry.
  - The `Location` header returned by `POST /locales` resolves to the created resource.
  - A deployed-only language (`en`) returns `source: 'static'`, all `actions` false, and no `id` or `createdAt`.
  - An unknown language returns 404.
  - An inactive language returns 404 to a visitor and 200 to staff.
- `describe('GET /locales/:locale/messages')` covers:
  - It serves the nested message tree a client merges.
  - It reports `revision`.
  - It returns an empty dictionary for a language with no entries.
  - The file continues with further cases that are not described here.

## Relationships
- `@tests/contract`, imported for its side effects, sets up contract-test infrastructure (`tests/support/contract.ts`).
- `tests/support/setup-test-db.ts` provides `setupTestDb`.
- `tests/support/http.ts` provides `api()` and `authenticateAs('admin')`, which return the supertest client and a bearer token.
- `tests/support/credentials.ts` provides `credentialHolding(['display:Locale'])`, which mints an API key secret.
- `tests/support/ids.ts` provides `MISSING_ID`.
- `./support` (`src/modules/locales/tests/contract/support.ts`) provides `createLanguage` and the `PORTUGUESE` fixture.
- `src/infrastructure/i18n` (`index.ts`, which re-exports `catalog.ts` and `context.ts`) provides `listSupportedLocales`, `getDefaultLocale`, `getFallbackLocale` and `translator`. The tests compare API responses against these runtime values.
- `tests/support/routes.ts` and `tests/unit/scripts/contracts/root-assembly.test.ts` are graph neighbors, but no direct interaction is visible in the shown portion.

## Notes
- The tests use the `@tests/*` and `@infrastructure/*` path aliases.
- The dictionary endpoint's 404 for database-only languages is intentional. The API's own copy must come from deployed files so it stays available during an outage of the store.
- The traversal tests rely on the supported-locale check as the guard, because the locale ends up in a filename.
- Contract compliance is asserted through the shared contract setup, with tests such as "matches the contract" checking only the status.
