---
source: tests/integration/upload-claim.test.ts
sha256: 30c14862513f5e444908975ddd2ad7ab1298ae28ebefa7b152f764064778b0ae
generated_at: 2026-10-29T07:04:43.683545+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/upload-claim.test.ts

## Purpose

Integration test that verifies upload-file ownership semantics end-to-end: the upload middleware deletes a file on disk when the request closes with a 4xx/5xx status and no controller called `claimUpload`, while a successful write keeps the file. It drives this through the three controllers that claim uploads by hand (create/update product, create user, replace an example cover) and asserts directly on the filesystem, since that is where an orphaned upload would be visible.

## Key elements

- **`PNG_BYTES`** – A genuinely decodable PNG buffer generated once in `beforeAll` via `decodablePng()`; required because without a broker the upload is digested inline by sharp.
- **`UPLOAD_DIRECTORY`** – Resolved to `publicDirectory()/images`; the location where the upload middleware writes before a controller claims or the close-hook deletes it.
- **`uploadedFiles()`** – Returns a list of regular files (not directories) currently in the upload directory; used as the assertion target for every test.
- **`settled(isDone)`** – Thin wrapper around `eventually(isDone, 1000)` to poll until the async close-hook deletion (or absence of it) has landed on disk.
- **`describe` blocks** – Four suites: `POST /products`, `PUT /products/:id`, `POST /users`, `PUT /examples/:id/cover`. Each contains a success case (expects 1 file on disk) and a failure case (expects 0 files).

## Relationships

- **`tests/support/http.ts`** – `api()`, `authenticateAs`, `authenticateAsRole` build every HTTP request and supply auth headers.
- **`tests/support/file-sandbox.ts`** – `emptyFileSandbox` runs in `afterEach` to reset the upload directory between tests.
- **`tests/support/setup-test-db.ts`** – `setupTestDb()` initialises the test database before the suite.
- **`tests/support/eventually.ts`** – `eventually` provides the polling primitive behind `settled`.
- **`tests/support/ids.ts`** – `MISSING_ID` is the canonical non-existent identifier used in the `PUT /products/:id` 404 case.
- **`tests/support/images.ts`** – `decodablePng()` and `publicDirectory()` supply the image fixture and the public root path.
- **`src/modules/locales/tests/factories.ts`** – `givenLocale('en')` seeds the locale in `beforeEach`.
- **`src/modules/users/tests/factories.ts`** – `createUser` seeds an "other" user for the ownership-failure example-cover test.
- **`src/modules/products/tests/factories.ts`** – `createProduct` seeds an existing product for the update success case.
- **`src/modules/example/tests/factories.ts`** – `createExample` seeds the example document whose cover is replaced.

## Notes

- **`settled(() => false)` in success cases** is a deliberate fixed 1 s delay, not a meaningful poll. It exists because the close hook still runs (and could theoretically delete) even on 2xx; the delay guarantees it has finished before the assertion reads disk.
- **Deletion is asynchronous relative to the response.** The close hook fires after the response bytes are flushed, so the file removal trails the HTTP status code. Tests must use `settled` (polling) rather than asserting immediately after `response` resolves.
- **`uploadedFiles()` filters to files only** to ignore the `thumbs/` subdirectory that sharp may create alongside the original.
- **Assertions are on disk, not on the response body.** The point is to catch a file that the middleware *failed* to clean up; the API response code alone cannot confirm that.
