---
source: src/modules/locales/tests/contract/api.contract.test.ts
sha256: 0e4023cd3f6622acbd8c518df917554bf408bd50dbe15b5c5eeb2c613fb479dc
generated_at: 2026-09-23T18:53:19.869033+00:00
model: ollama:qwen3.8:27b
---

# src/modules/locales/tests/contract/api.contract.test.ts

## Purpose

Contract tests for the `/locales` API surface. The file verifies both the shape of every endpoint (via `toSatisfyApiSpec`) and the semantic boundary between the two locale tiers: languages shipped as deployed files (the API's own dictionaries) versus languages registered at runtime in the database (client-downloadable dictionaries). The central invariant guarded here is that a language existing in the database never implies the API can answer in it.

## Key elements

- **`createLanguage(bearer, body?)`** — helper that `POST /locales` through the real route; throws on non-201. Defaults to registering Portuguese (`pt`).
- **`createEntry(bearer, tag, key, value, tenant?)`** — helper that `POST /locales/:tag/entries`; throws on non-201.
- **`PORTUGUESE`** — the default language payload used by the helpers.
- **`MISSING_ID`** — a valid-format ObjectId guaranteed not to exist, used to exercise the 404 (not 422) branch.
- **`describe('GET /locales')`** — contract shape, that the tag list matches `listSupportedLocales()`, database-only languages appear with `source: 'dynamic'` and only client tenants, merged languages show `source: 'both'`, entry counts, inactive-language hiding, and public (unauthenticated) access.
- **`describe('GET /locales/:locale')`** — serves the deployed dictionary (shared keys + module-contributed namespaces), 404s for unknown *or* database-only locales, and rejects path-traversal attempts (`..%2F..`, `%2Fetc%2Fpasswd`, `en.json`) with 404.
- **`describe('GET /locales/:locale/messages')`** — returns the nested key tree for a database language, includes `revision`, answers `{}` for an empty dictionary, is public, and 404s for inactive languages identically to unknown ones.
- **`describe('POST /locales')`** — contract shape, 409 on duplicate tag, 422 on invalid tag format, plus a regression test for a fuzz-discovered trim-to-empty validation gap.

## Relationships

- **`tests/support/contract.ts`** — provides the `toSatisfyApiSpec` matcher used in nearly every assertion to validate responses against `openapi.yaml`.
- **`tests/support/http.ts`** — provides `api()` (supertest instance) and `authenticateAs()` used for all HTTP calls and bearer-token setup.
- **`tests/support/setup-test-db.ts`** — provides `setupTestDb()`, called at module level to initialise a clean in-memory database before any test runs.
- **`src/infrastructure/i18n/index.ts`** — re-exports `listSupportedLocales`, `getDefaultLocale`, `getFallbackLocale`, and `readLocaleDictionary`; the tests compare API responses against these runtime values to verify the static tier is faithfully reflected.
- **`src/modules/products/tests/factories.ts`** — exports `createProduct`, imported here (likely used in a later test for product-keyed entry namespacing).

## Notes

- The file encodes a deliberate architectural decision: `GET /locales/:locale` must **404** for database-only languages. A regression that collapses the two tiers (e.g., serving DB entries from this endpoint) will fail here rather than surfacing as a client-side missing-translation bug.
- Path-traversal tests use URL-encoded sequences (`..%2F..%2Fpackage`) because Express normalises raw `..` before routing; the realistic attack vector is the encoded form.
- The `createProduct` import from the products factory is present but not exercised in the visible portion of the file—likely used in a truncated section that tests module-namespaced entries.
- The module doc comment explicitly states the property being guarded: *"a language existing in the database never implies the API can answer in it."* New tests should preserve that framing.
