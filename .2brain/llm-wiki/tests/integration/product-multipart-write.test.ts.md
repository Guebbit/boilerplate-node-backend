---
source: tests/integration/product-multipart-write.test.ts
sha256: 3fb7f18d0ecb320dfe32b2fa27cbfa56a2b07ead5b0b001e4082a3f8f6f8fdbf
generated_at: 2026-09-27T15:57:04.736428+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/product-multipart-write.test.ts

## Purpose

Integration test verifying that multipart form submissions to the products endpoint correctly decode string-transported numeric and boolean fields into properly typed values. It exists because multipart bodies arrive with every field as a string, and no other suite exercises the combination of multipart transport with the product schema's `z.number()` / `z.boolean()` fields.

## Key elements

- **`beforeAll` (top-level)** — Generates a real 4×4 RGB PNG via `sharp` so the upload pipeline's inline digest (which fully decodes the image) succeeds.
- **`uploadedFiles()`** — Lists files (not directories) in the resolved `NODE_PUBLIC_PATH/images` directory; used to assert no orphaned uploads remain after a rejected write.
- **`beforeAll` (locale config)** — Registers `product` as a translatable resource via `localeService.setTranslatables`, wiring `productRepository.existsById` / `writeTranslatedFields`.
- **`afterAll`** — Clears the translatable registration so other suites are unaffected.
- **`beforeEach`** — Persists the `en` fallback locale (required by the locale service for any product write).
- **`afterEach`** — Calls `emptyFileSandbox` to remove the original, thumbnail, and any quarantined file from the upload directory.
- **Test cases (6):**
  - Creates a product via multipart; asserts `price` is stored as the number `101.5`, not the string `'101.5'`.
  - Updates an existing product via multipart `PATCH`; asserts `price` decodes to `42`.
  - Sends `active` as string `'false'`; asserts the stored value is boolean `false` (the string would be truthy).
  - Sends `requiresShipping` as string `'false'`; same truthiness trap, separate decode-list entry.
  - Omits `active` entirely; asserts it defaults to `true`.
  - Sends `price: 'not-a-number'`; expects 422 and verifies no upload file was left on disk.

## Relationships

- **`tests/support/http.ts`** — Supplies `api()` (supertest-style request builder with `.field` / `.attach` for multipart) and `authenticateAs('admin')` for bearer tokens.
- **`tests/support/file-sandbox.ts`** — `emptyFileSandbox` is the `afterEach` cleanup that wipes the upload directory; also (per its comment) sets `NODE_PUBLIC_PATH` before any test file executes.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` provides an isolated database per suite.
- **`src/modules/locales/factories.ts`** — `makeLocale` builds the locale record persisted in `beforeEach`.
- **`src/modules/locales/repository.ts`** — `localeRepository.create` persists that record into the test DB.
- **`src/modules/locales/services/index.ts`** — `localeService.setTranslatables` / clear the translatable mapping the product endpoints consult.
- **`src/modules/products/repository.ts`** — `productRepository.existsById` and `productRepository.writeTranslatedFields` are the callbacks handed to the locale service.

## Notes

- The PNG must be a *genuinely decodable* image, not a magic-byte stub: without a broker, the digest pipeline calls `sharp` to decode inline, so a header-only buffer would throw.
- `process.env.NODE_PUBLIC_PATH!` carries a non-null assertion because `setup-file-sandbox.ts` assigns it in a module-level side-effect that runs before any test file's own top-level code; the `!` is purely for the type-checker.
- Assertions read the **persisted** value from the response body (e.g. `body.data.price`), not just the HTTP status, because a 201 that stored `'101.5'` as a string would be the same class of bug with a friendlier code.
- The 422 case doubles as a leak check: a rejected write must not leave its attached file in the upload directory.
- The fallback locale tag is hardcoded to `'en'` matching the convention in `.env-example`; if the environment changes its fallback, this suite breaks.
