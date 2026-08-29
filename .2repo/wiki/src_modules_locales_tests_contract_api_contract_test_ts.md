# src/modules/locales/tests/contract/api.contract.test.ts

## Purpose

Contract tests for every `/locales` endpoint (manifest, dictionary, tenant messages, registration). Beyond shape-checking against the OpenAPI spec, the suite pins the **tier boundary**: a language registered in the database is downloadable as a tenant dictionary but must *not* make the API's own copy endpoint answer in that language. That invariant is the property the design rests on, and these tests are written to fail the moment the two keyspaces collapse.

## Key elements

- **`MISSING_ID`** – a syntactically valid ObjectId guaranteed absent, used to hit the 404 (not 422) branch.
- **`PORTUGUESE`** – default language fixture (`{ tag: 'pt', … }`) for every registration case unless overridden.
- **`createLanguage(bearer, body?)`** – POSTs `/locales` through the real HTTP route; throws on non-201.
- **`createEntry(bearer, tag, key, value, tenant?)`** – POSTs `/locales/:tag/entries`; returns the entry id.
- **`describe('GET /locales')`** – manifest: shape contract, tier merge (`source: 'both'`), entry count / revision, inactive hiding, public access.
- **`describe('GET /locales/:locale')`** – dictionary: merged shared + module keys, 404 for DB-only locale, encoded path-traversal guard.
- **`describe('GET /locales/:locale/messages')`** – tenant tree: nested key structure, revision stamp, empty-dict case, public, inactive → 404.
- **`describe('POST /locales')`** – registration: 201 success, 409 duplicate tag, 422 invalid tag.

## Relationships

| Neighbor | Interaction |
|---|---|
| `tests/support/contract.ts` | Imported as `@tests/contract`; provides the `toSatisfyApiSpec()` matcher used in every "matches the contract" assertion. |
| `tests/support/http.ts` | Provides `api()` (supertest-style client) and `authenticateAs()` for bearer-token setup. |
| `tests/support/setup-test-db.ts` | `setupTestDb()` is called once at module top to seed/prepare the test database before any test runs. |
| `src/infrastructure/i18n/catalog.ts` | Exports `listSupportedLocales()`, `getDefaultLocale()`, `getFallbackLocale()` — the source-of-truth values the manifest assertions compare against. |
| `src/infrastructure/i18n/index.ts` | Barrel re-export consumed via the `@infrastructure/i18n` alias; also re-exports `readLocaleDictionary`. |

## Notes

- **The single most important assertion** is in `GET /locales/:locale`: after registering a DB-only language, the endpoint must still return **404**. This is the tier boundary; if it ever starts serving from the store, the API loses its availability guarantee during a DB outage.
- Path-traversal tests use **URL-encoded** sequences (`..%2F..%2Fpackage`) because Express normalises literal `..` before routing; the realistic attack vector is the encoded form.
- The "module keys present" check in `GET /locales/:locale` asserts *at least one namespace beyond the shared file's keys* rather than naming a specific module, keeping the test decoupled from which modules exist.
- `GET /locales/:locale` imports `it.json` (a deployed dictionary) at the top level to assert the shared half of the merged response; this couples the test to that file existing in the repo.
- All read endpoints (`GET`) are intentionally public — the tests assert 200 with **no** Authorization header.
