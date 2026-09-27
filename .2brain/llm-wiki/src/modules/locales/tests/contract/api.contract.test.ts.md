---
source: src/modules/locales/tests/contract/api.contract.test.ts
sha256: c11f29ec2c7facf11211153a3a2f677e3958233a3a5a78cc61e2fa72ec4740a2
generated_at: 2026-09-27T15:02:30.201563+00:00
model: ollama:qwen3.8:27b
---

# src/modules/locales/tests/contract/api.contract.test.ts

## Purpose

Contract tests for the `/locales` API surface. They assert that responses satisfy the `openapi.yaml` spec (shape) and pin the semantic boundary between two tiers of locale data: **deployed** (static files the API can serve copy from) and **dynamic** (rows in the database that a client can download but the API cannot answer in). The tests exist so that collapsing or blurring that boundary fails here rather than in a downstream client.

## Key elements

- **`PORTUGUESE`** — default language payload (`{ tag: 'pt', name: 'Portuguese', nativeName: 'Portuguese' }`) used by most cases.
- **`createLanguage(bearer, body?)`** — registers a language via `POST /locales` and returns its tag; throws on non-201.
- **`createEntry(bearer, tag, key, value, tenant?)`** — adds a single translation entry via `POST /locales/:tag/entries` and returns its id.
- **`describe('GET /locales')`** — verifies spec conformance, that deployed languages report `tenants` containing `'demo-be'`, that a database-only language appears with `source: 'dynamic'` and only `'demo-fe'`, that a dual-tier language merges to one row with `source: 'both'`, entry counting, inactive-language hiding, and public access.
- **`describe('GET /locales/:locale')`** — verifies the API serves its own (file-backed) dictionary including contributed module namespaces, returns 404 for unknown or database-only locales, and rejects path-traversal payloads (`..%2F..%2Fpackage`, `%2Fetc%2Fpasswd`, `en.json`).
- **`describe('GET /locales/:locale/messages')`** — verifies the nested-key tree shape a client merges, revision stamping, empty-dictionary response, public access, and 404 for inactive or unknown locales.
- **`describe('POST /locales')`** — verifies 201 creation, 409 duplicate tag, 422 invalid tag format, and a trim-to-empty edge case (space-only tag).

## Relationships

- **`tests/support/contract.ts`** — supplies the `toSatisfyApiSpec()` jest matcher used throughout to validate responses against `openapi.yaml`.
- **`tests/support/http.ts`** — supplies `api()` (supertest wrapper) and `authenticateAs()` (bearer-token helper) used by every case.
- **`tests/support/setup-test-db.ts`** — called once at module top to seed a clean test database before any test runs.
- **`tests/support/ids.ts`** — exports `MISSING_ID` (imported for use in later/truncated sections of the file).
- **`src/infrastructure/i18n/index.ts` → `src/infrastructure/i18n/catalog.ts`** — provides `listSupportedLocales()`, `getDefaultLocale()`, `getFallbackLocale()`, and `readLocaleDictionary()` which the tests call to compare against API responses (ground-truth for the "deployed" tier).
- **`src/modules/products/tests/factories.ts`** — exports `createProduct`, imported here (used in truncated sections to verify cross-module locale entry behavior).
- **`../../../../locales/it.json`** — the Italian dictionary file imported as `itTranslation` to assert that `GET /locales/it` includes the shared (file-backed) half of the response.

## Notes

- The file imports from `@tests/...` and `@infrastructure/...` path aliases; the Italian JSON is imported via a relative path, which is inconsistent with the alias convention but deliberate (it targets a static asset, not a module).
- `setupTestDb()` is called at module scope (not inside `beforeAll`), so the database is prepared before the test runner discovers cases.
- The "tier boundary" is the file's core invariant: a language present only in the database must appear in `GET /locales` (downloadable) but must **not** change the behavior of `GET /locales/:locale` (answerable). Two tests guard this from opposite sides.
- Path-traversal test uses `it.each` with pre-encoded sequences; the comment notes that Express normalises raw `..` before routing, so the realistic attack vector is percent-encoded.
- The trim-to-empty tag test documents a real bug found by the fuzz suite (Mongoose `ValidationError` → 500) and encodes the expected 422.
