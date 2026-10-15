---
source: tests/integration/product-multipart-write.test.ts
sha256: 5753c338d68556e17375a77c0a370edb4bc7897f31921088f389f475c0d28f09
generated_at: 2026-10-15T12:50:58.241799+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/product-multipart-write.test.ts

## Purpose

Integration test suite that verifies the product create/update endpoints correctly decode string-typed form fields (`price`, `active`, `requiresShipping`) into proper numbers and booleans before Zod validation when the request body is multipart (the only transport that carries an image). It is the sole suite covering this combination: the JSON contract suite already has correct types, the upload-security suite exercises multipart but against a signup endpoint with no numeric field, and the frontend mock coerces values client-side.

## Key elements

- **`UPLOAD_DIRECTORY`** — Resolved from `currentEnvironment().NODE_PUBLIC_PATH` + `/images`; used by `uploadedFiles()` to inspect persisted artifacts.
- **`PNG_BYTES`** — A real 4×4 RGB PNG generated via `sharp` in `beforeAll`; required because the inline digest pipeline actually decodes the image.
- **`uploadedFiles()`** — Lists only regular files (not the `thumbs/` subdirectory) in the upload directory.
- **`beforeAll` (locale)** — Registers product translatables on `localeService` using `productRepository` methods; cleared in `afterAll`.
- **`beforeEach`** — Creates the `en` fallback locale via `localeRepository.create` + `makeLocale`.
- **`afterEach`** — Calls `emptyFileSandbox` to remove any persisted uploads/thumbnails.
- **Six test cases** — Cover: create with string price → 201 + numeric `price`; update with string price → 200 + numeric `price`; `active: 'false'` → `false`; `requiresShipping: 'false'` → `false`; omitted `active` defaults to `true`; non-numeric price → 422 + no orphaned files.

## Relationships

- **`tests/support/http.ts`** — Provides `api` (supertest instance) and `authenticateAs` for bearer-token auth.
- **`tests/support/file-sandbox.ts`** — `emptyFileSandbox` tears down the upload directory between tests.
- **`tests/support/setup-test-db.ts`** — `setupTestDb` initialises the test database before the suite runs.
- **`src/modules/locales/repository.ts`** — `localeRepository.create` persists the fallback locale in `beforeEach`.
- **`src/modules/locales/factories.ts`** — `makeLocale` builds the locale record for creation.
- **`src/modules/locales/services/index.ts`** — `localeService.setTranslatables` wires product translation fields for the test run.
- **`src/modules/products/repository.ts`** — `productRepository.existsById`, `.writeTranslatedFields`, `.markEdited` are passed as translatable callbacks.
- **`src/infrastructure/config/store.ts`** — `currentEnvironment().NODE_PUBLIC_PATH` supplies the base path for `UPLOAD_DIRECTORY`.

## Notes

- The `!` assertion on `NODE_PUBLIC_PATH` is safe only because `setup-file-sandbox.ts` assigns it before any test file's top-level code executes; removing that setup file would break this constant.
- The PNG must be genuinely decodable (not a magic-byte stub) because every broker-less upload is digested inline via `sharp`, which performs a full decode.
- The 422 rejection test asserts `uploadedFiles()` is empty: a failed write must not leave an orphaned image behind.
- The `uploadedFiles()` helper deliberately filters to `isFile()` to exclude the `thumbs/` derivative directory that the digest pipeline creates alongside uploads.
