---
source: tests/integration/product-multipart-write.test.ts
sha256: f2c5b7d382b8202a77bb8be8adcd7d22dc4d3b9bf81b23c8f42beb81b8600eec
generated_at: 2026-11-08T09:45:37.933481+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/product-multipart-write.test.ts

## Purpose

Integration tests that verify product create and update requests sent as **multipart form bodies** correctly decode string-transported fields (`price`, `active`, `requiresShipping`, `allowBackorder`) into proper types before validation. This is the only suite that exercises the combination of a multipart body *and* numeric/boolean fields on the product schema, since the JSON contract suite already has correct types, `upload-security` uses multipart but only on a signup endpoint with no numeric fields, and the frontend mock coerces values before sending.

## Key elements

- **`describe('writing a product through a multipart body')`** — the single suite, containing seven test cases covering create, update, boolean decoding, defaults, and invalid-price rejection.
- **`beforeAll` / `PNG_BYTES`** — lazily generates a genuinely decodable PNG via `decodablePng()`; a magic-byte stub is insufficient because the digest pipeline calls `sharp` to decode inline.
- **`uploadedFiles()`** — helper that lists only *files* (not the `thumbs/` subdirectory) in the upload directory, used to assert that a rejected write leaves no orphaned upload behind.
- **`FALLBACK = 'en'`** — the fallback locale seeded in `beforeEach` via `givenLocale`, matching the same convention in the locales integration suite.

## Relationships

- **`tests/support/http.ts`** — provides `api()` (a supertest-style client that boots the real app) and `authenticateAs('admin')` for bearer tokens. Importing this module is what registers every enabled module's `translatables` at boot.
- **`tests/support/file-sandbox.ts`** — `emptyFileSandbox` is the `afterEach` cleanup that removes the original upload, its thumbnail, and any quarantined files so each test starts from an empty directory.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` manages the test-database lifecycle (truncation between suites).
- **`tests/support/images.ts`** — `decodablePng()` produces a valid PNG buffer; `publicDirectory()` yields the base path under which uploads land.
- **`src/modules/locales/tests/factories.ts`** — `givenLocale(FALLBACK)` ensures the `en` locale row exists so translations attach cleanly in every test case.

## Notes

- The `!` non-null assertion on `UPLOAD_DIRECTORY` is a compiler-only narrowing; at runtime `publicDirectory()` is always set because `setup-file-sandbox.ts` runs before any test file's top-level code.
- Assertions check **persisted field values** (e.g. `response.body.price` equals the formatted number `'101.50'`, `response.body.active` is the boolean `false`), not merely the HTTP status. A 201 that stored `price: '101.5'` as a string would pass a status-only check but represent a real bug.
- The `allowBackorder` test is the only one that performs a multipart **PATCH without an image attach**, covering the case where an edit form resubmits the field on every save.
- The invalid-price test (`'not-a-number'`) confirms the decoder leaves unparseable values as strings so Zod reports a clean 422 rather than a `NaN`-related error, and that no upload file is persisted on rejection.
