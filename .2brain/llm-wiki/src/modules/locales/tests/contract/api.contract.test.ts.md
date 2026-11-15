---
source: src/modules/locales/tests/contract/api.contract.test.ts
sha256: 5fd0e35d6652262629698969cb7fc66ae8770b96a4df0c4355221682e8ecdc6a
generated_at: 2026-11-14T20:23:05.953608+00:00
model: ollama:qwen3.8:27b
---

# src/modules/locales/tests/contract/api.contract.test.ts

## Purpose

Contract tests for the `/locales` API surface — the manifest, dictionary, per-locale read, and messages endpoints. The central property under guard is the **tier boundary**: a language that exists only in the database must never cause the API to claim it can answer in that language. The tests are written so that a future change collapsing the static (deployed-file) and dynamic (database) tiers fails here rather than surfacing as a client bug.

## Key elements

- **`createEntry(bearer, tag, key, value, app?)`** — helper that POSTs a single locale entry through the real route and returns its id; used to seed data for the messages/manifest assertions.
- **`tags(response)`** — extracts the `tag` array from a manifest response body.
- **`describe('GET /locales')`** — asserts the manifest lists every deployed language, reports `default`/`fallback` from the i18n catalog, marks database-only languages as `source: 'dynamic'`, merges a language present in both tiers into one row (`source: 'both'`), reports `entryCount`/`revision`, hides inactive languages from the public list, and enforces the `display:Locale` API-key visibility rule.
- **`describe('GET /locales/:locale/dictionary')`** — asserts the dictionary endpoint serves the API's own deployed JSON (shared + contributed namespaces), returns 404 for undeployed locales, still 404s for a database-only language (the tier-boundary assertion), and rejects path-traversal attempts (`..%2F..%2Fpackage`, `%2Fetc%2Fpasswd`, etc.) with 404.
- **`describe('GET /locales/:locale')`** — asserts single-locale read returns the same shape as the manifest row, honors the `Location` header from POST, returns `source: 'static'` with `actions` all false and no `id`/`createdAt` for deployed-only languages, 404s for unknown tags, and hides inactive languages from unauthenticated callers while showing them to staff.
- **`describe('GET /locales/:locale/messages')`** — asserts the nested key→value tree matches what was written, reports the correct `revision`, returns `{}` for an empty language, and is publicly accessible.

## Relationships

- **`src/infrastructure/i18n/index.ts`** — source of the public re-exports (`listSupportedLocales`, `getDefaultLocale`, `getFallbackLocale`, `translator`) that the manifest and dictionary assertions compare against.
- **`src/infrastructure/i18n/catalog.ts`** / **`src/infrastructure/i18n/context.ts`** — the concrete implementations behind those i18n exports; the tests pin their output as the expected API response.
- **`src/modules/locales/tests/contract/support.ts`** — provides `createLanguage` (creates a dynamic language row) and the `PORTUGUESE` fixture used throughout the suite.
- **`tests/support/contract.ts`** — imported for side effects; configures the contract-test harness so responses are validated against the published OpenAPI schema.
- **`tests/support/http.ts`** — supplies the `api()` HTTP client and `authenticateAs` used by every request in the file.
- **`tests/support/credentials.ts`** — `credentialHolding(['display:Locale'])` mints a scoped API key for the inactive-visibility test.
- **`tests/support/ids.ts`** — provides `MISSING_ID` for malformed-id assertions.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` is called at module scope to prepare an isolated database per test run.

## Notes

- The file imports `@tests/contract` **for side effects only** (no named bindings); it registers OpenAPI schema checks globally so every `api()` response is validated against the published spec.
- The path-traversal test (`..%2F..%2Fpackage`, `%2Fetc%2Fpasswd`) is the only security assertion in the file; it relies on the supported-locale allowlist acting as the traversal guard rather than on Express's own `..` normalisation.
- The dictionary test for the "module half" asserts that *some* non-shared namespace keys exist (`contributed.length > 0`) rather than naming specific modules, so new i18n namespaces don't break the test.
- `MISSING_ID` is imported but not visible in the truncated portion; it is likely used in a test case that was cut off (probably a 404/422 for an invalid locale id).
- The test for `GET /locales` "is public" is deliberately unauthenticated — the comment notes the client that needs the manifest most is the one that just failed to log in.
