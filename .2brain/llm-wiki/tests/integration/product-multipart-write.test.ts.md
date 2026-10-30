---
source: tests/integration/product-multipart-write.test.ts
sha256: 16e1477a7e07c693dfc102930cb8815babadcade0ddbacf60833e0d924cd0e80
generated_at: 2026-10-29T07:00:49.564790+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/product-multipart-write.test.ts

## Purpose

Integration tests that verify the product create/patch endpoints correctly decode string-typed form fields (`price`, `active`, `requiresShipping`, `allowBackorder`) when the body arrives as `multipart/form-data`. This is the only suite that exercises the multipart + typed-field combination, because the contract suite uses JSON and the upload-security suite hits an endpoint with no numeric fields. It asserts on the persisted values in the response body, not merely the status code, so that a 201 that silently stores `'101.5'` as a string would still fail.

## Key elements

- **`beforeAll`** — fetches a genuinely decodable PNG via `decodablePng()` (sharp must be able to decode it, not just recognise the magic bytes).
- **`uploadedFiles()`** — helper that lists regular files in the upload directory; used to assert a rejected write left no orphaned uploads.
- **`describe('writing a product through a multipart body')`** — the single suite; each test authenticates as admin, sends a multipart POST or PATCH with string fields + an attached PNG, and checks both status and decoded field values in the response body.
- **Test cases** cover: price decode on create, price decode on update, `active` boolean decode, `requiresShipping` boolean decode, `allowBackorder` on both create and update, default `active: true` when omitted, and 422 rejection of a non-numeric price (with no leftover file).

## Relationships

- **`tests/support/http.ts`** — `api()` and `authenticateAs()` supply the supertest client and admin bearer token used by every test.
- **`tests/support/file-sandbox.ts`** — `emptyFileSandbox` is the `afterEach` hook that clears the upload directory (original, thumbnail, quarantine) between tests.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` initialises the in-memory/test database before the suite runs.
- **`tests/support/images.ts`** — `decodablePng()` produces the PNG buffer; `publicDirectory()` provides the root path from which `UPLOAD_DIRECTORY` is derived.
- **`src/modules/locales/tests/factories.ts`** — `givenLocale('en')` seeds the fallback locale in `beforeEach` so the translations object in each request is accepted.

## Notes

- The file relies on `@tests/http`'s import side-effect (booting the real app) to register translatable modules; this is implicit and documented only in the inline comment above `FALLBACK`.
- `UPLOAD_DIRECTORY` uses a non-null assertion (`!`) because `setup-test-db.ts` is expected to assign it before any test top-level code executes.
- The `uploadedFiles()` helper filters to regular files specifically so that the `thumbs/` derivative directory (created by the digest pipeline) does not appear as a "leftover" in the 422 assertion.
- `'en'` is assumed to be the fallback locale in every environment this suite targets (see `.env-example`); if a custom fallback is configured, these tests will fail in `beforeEach`.
