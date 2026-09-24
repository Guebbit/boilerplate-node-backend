---
source: tests/integration/product-multipart-write.test.ts
sha256: 72ba888de4d2cde5ec2b4f96dcb3a1870e7712f4957bb3993d1e45e972581e46
generated_at: 2026-09-23T20:05:36.529440+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/product-multipart-write.test.ts

## Purpose

Integration test verifying that product create/update requests sent as multipart form bodies (the only way to attach an image) correctly decode string-transported fields — `price` and `active` — into their native types before zod validation. It exists because no other suite covers this combination: the contract suite posts JSON (types already correct), the upload-security suite hits a route with no numeric field, and the frontend mock coerces values before dispatch.

## Key elements

- **`PNG_BYTES`** – A real 4×4 PNG generated with `sharp` in `beforeAll`. Must be fully decodable (not just magic bytes) because uploads are digested inline.
- **`uploadedFiles()`** – Lists regular files in the upload directory, explicitly excluding the `thumbs/` subdirectory.
- **`beforeAll` (locale)** – Registers `localeService.setTranslatables` so the product's `title`/`description` are treated as translatable fields.
- **`beforeEach`** – Seeds the fallback `en` locale via `localeRepository.create(makeLocale(…))`.
- **`afterEach`** – Calls `emptyFileSandbox` to remove original, thumbnail, and any quarantined files.
- **Five `it` blocks:**
  - *create with price decoding* – POST `/products`, asserts `body.data.price` is `101.5` (number) and `imageUrl` matches the expected pattern.
  - *update with price decoding* – Creates via JSON, then PATCHes multipart; asserts `price === 42`.
  - *boolean decoding* – Sends `active: 'false'`; asserts stored value is `false`, not the truthy string.
  - *default active* – Omits `active`; asserts stored value is `true`.
  - *reject non-numeric price* – Sends `price: 'not-a-number'`; expects 422 and an empty upload directory (no orphaned file).

## Relationships

| Neighbor | Interaction |
|---|---|
| `tests/support/http.ts` | Provides `api()` (supertest wrapper) and `authenticateAs('admin')` for bearer auth. |
| `tests/support/file-sandbox.ts` | `emptyFileSandbox` runs in `afterEach` to wipe the upload directory. |
| `tests/support/setup-test-db.ts` | `setupTestDb()` called at module top-level to prepare a clean database. |
| `src/modules/locales/repository.ts` | `localeRepository.create` seeds the fallback locale before each test. |
| `src/modules/locales/factories.ts` | `makeLocale` builds the locale fixture object. |
| `src/modules/locales/services/index.ts` | `localeService.setTranslatables` registers which product fields are translatable; cleared in `afterAll`. |

## Notes

- `process.env.NODE_PUBLIC_PATH!` carries a non-null assertion because `tests/support/setup-file-sandbox.ts` assigns the variable before any test module's top-level code executes; the `!` only silences the compiler.
- Assertions deliberately inspect the **response body**, not just the status code, so a 201/200 that silently persisted `'101.5'` as a string would still fail.
- The string decoder leaves unparseable values as the original string (rather than coercing to `NaN`), which is what keeps the last test a clean 422 instead of a confusing validator message.
- The fallback locale tag is hard-coded to `'en'`; the comment notes this is guaranteed by `.env-example`.
