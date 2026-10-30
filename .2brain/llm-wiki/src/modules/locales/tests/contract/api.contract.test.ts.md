---
source: src/modules/locales/tests/contract/api.contract.test.ts
sha256: 23cad1f0051e5b819c6ec46a4c2cdbbbfc60c19ba305bdc52b392aa81b953b14
generated_at: 2026-10-29T04:25:16.286767+00:00
model: ollama:qwen3.8:27b
---

# src/modules/locales/tests/contract/api.contract.test.ts

## Purpose

Contract tests for the `/locales` API surface. The file guards a specific architectural boundary: languages shipped as **deployed files** (the API's own error messages, available in outages) versus languages **registered in the database** (client-facing, editable at runtime). The tests assert that a language existing in the DB never silently implies the API can answer in it, so a future change collapsing the two tiers fails here rather than in a client.

## Key elements

- **`createEntry` (local helper)** — Posts a key/value pair through the real `POST /locales/:tag/apps/:app/entries` route and returns the new entry's `id`. Used to seed translations without touching the DB directly.
- **`tags` (local helper)** — Extracts the `tag` array from a manifest response body.
- **`describe('GET /locales')`** — Verifies the manifest lists every deployed language, merges DB-only and file-only languages correctly (source: `"static"`, `"dynamic"`, `"both"`), reports entry counts/revision, hides inactive languages from anonymous callers but exposes them to `display:Locale` API keys, and is publicly reachable (200 without auth).
- **`describe('GET /locales/:locale/dictionary')`** — Serves the API's own i18n dictionary (shared + module namespaces) for deployed locales only; 404s for DB-only locales and for path-traversal attempts (`..%2F..`, encoded `/etc/passwd`, `en.json`).
- **`describe('GET /locales/:locale')`** — Returns a registered language in the same shape as the list and write endpoints; answers the `Location` header returned by `POST /locales`; serves file-only languages with `source: "static"` and all `actions` set to `false`; hides inactive languages from visitors but shows them to authenticated staff.
- **`describe('GET /locales/:locale/messages')`** — Returns the nested key→value tree a client merges, includes the current `revision`, returns `{}` for an empty language, and is public.

## Relationships

- **`@infrastructure/i18n` (index, catalog, context)** — Imports `listSupportedLocales`, `getDefaultLocale`, `getFallbackLocale`, and `translator` to assert that the manifest's `locales` array, `default`, and `fallback` fields match the runtime i18n configuration, and to compare the dictionary endpoint's output against the `it.json` shared locale file.
- **`./support`** — Imports `createLanguage` (admin-creates a language row via the real API) and the `PORTUGUESE` fixture object used for POST bodies.
- **`@tests/contract`** — Side-effect import that registers contract-testing matchers / setup.
- **`@tests/http`** — Provides `api()` (supertest-style request builder), `authenticateAs`, and `authenticateAsRole` for building authenticated requests.
- **`@tests/credentials`** — Provides `credentialHolding` to mint an API key scoped to `display:Locale` for the visibility test.
- **`@tests/ids`** — Exports `MISSING_ID` (used in assertions where an absent id is expected, e.g. static-locale responses).
- **`@tests/setup-test-db`** — `setupTestDb()` is called at module top-level to ensure a clean DB fixture before any test runs.
- **`@tests/routes`** — Provides route constants/helpers used by the HTTP helpers above (indirect dependency through `@tests/http`).

## Notes

- The file is intentionally **public-facing**: several tests assert 200 with no `Authorization` header because the primary consumer is a client that has *just* failed to log in.
- The "tier boundary" is the load-bearing assertion. The test *"still 404s for a language that exists only in the database"* (dictionary endpoint) exists specifically so the day the API starts serving DB-stored copy as its own error messages, it breaks here first.
- Path-traversal tests use **encoded** sequences (`%2F`) rather than literal `..` because Express normalises the latter before routing; the realistic attack vector is the encoded form.
- The dictionary test for `it` asserts module-contributed namespaces as *"at least one extra key beyond the shared file"* rather than naming specific modules, so it survives adding/removing modules.
- `setupTestDb()` is called at module scope (not inside each test), relying on the test runner's isolation; it is not wrapped in `beforeEach`.
