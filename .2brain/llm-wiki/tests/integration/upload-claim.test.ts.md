---
source: tests/integration/upload-claim.test.ts
sha256: a909468f939d97cfd71081dc4b0d0e330f947e678d7905d8dab2b278bc6bb022
generated_at: 2026-10-15T12:55:28.374292+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/upload-claim.test.ts

## Purpose

Integration test verifying the upload-claim lifecycle end-to-end: when a request that carries an image upload **succeeds**, the file is retained on disk; when it **fails** (4xx), the upload middleware's close hook deletes the unclaimed file. Covers the four controllers that perform a manual `claimUpload` — create product, update product, create user, and replace an example's cover — asserting against the actual filesystem.

## Key elements

- **`PNG_BYTES`** — a 4×4 PNG buffer generated once in `beforeAll` via `sharp`; used as the attached image in every request (must be decodable because, without a broker, the upload is digested inline).
- **`uploadedFiles()`** — lists files (not directories) in the resolved upload directory; used to assert whether an orphan remains or was cleaned up.
- **`settled(isDone)`** — polls every 20 ms (up to ~1 s) until `isDone()` is true. Needed because the close hook that deletes unclaimed uploads fires *after* the HTTP response has already been sent.
- **`IMAGE`** — constant `{ filename: 'upload.png', contentType: 'image/png' }` for the `.attach()` call.
- **`describe` blocks** — four endpoint groups (`POST /products`, `PUT /products/:id`, `POST /users`, `PUT /examples/:id/cover`), each containing a "keeps" (success) and a "deletes" (failure) case.

## Relationships

- **`tests/support/http.ts`** — provides `api()` (HTTP client) and `authenticateAs()` (bearer-token auth) used in every request.
- **`tests/support/file-sandbox.ts`** — `emptyFileSandbox` called in `afterEach` to wipe the upload directory between tests; also responsible for assigning `NODE_PUBLIC_PATH` before test code runs.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` resets the database for isolation.
- **`tests/support/ids.ts`** — exports `MISSING_ID`, a guaranteed-absent ID used to trigger the 404 path on `PUT /products/:id`.
- **`src/infrastructure/config/store.ts`** — `currentEnvironment()` reads `NODE_PUBLIC_PATH` to resolve the upload directory at the top of the file.
- **`src/modules/locales/repository.ts`** + **`src/modules/locales/factories.ts`** — a locale (`en`) is created in `beforeEach` because product creation depends on it existing.
- **`src/modules/products/tests/factories.ts`** — `createProduct()` seeds a product for the update-path tests.
- **`src/modules/users/tests/factories.ts`** — `createUser()` seeds a second user so the example-cover test can exercise the ownership/404 case.
- **`src/modules/example/tests/factories.ts`** — `createExample()` seeds an example tied to a specific user for the cover-replacement tests.

## Notes

- The `settled()` poll is not optional: the deletion happens in a close hook that fires after the response flushes, so an immediate `expect(uploadedFiles()).toEqual([])` would race.
- `uploadedFiles()` deliberately filters with `statSync(...).isFile()` to ignore the `thumbs/` subdirectory that the upload pipeline creates.
- The non-null assertion on `currentEnvironment().NODE_PUBLIC_PATH!` is safe at runtime because `setup-file-sandbox.ts` assigns it before any test file's top-level code executes, but the TypeScript compiler cannot see that ordering.
- Failure scenarios are chosen to exercise *different* 4xx paths: validation error (422) for product/user creation, not-found (404) for product update and example cover ownership.
