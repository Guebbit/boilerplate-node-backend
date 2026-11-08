---
source: tests/integration/upload-claim.test.ts
sha256: 30c14862513f5e444908975ddd2ad7ab1298ae28ebefa7b152f764064778b0ae
generated_at: 2026-11-08T09:50:07.024933+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/upload-claim.test.ts

## Purpose

Integration test that verifies the upload-claim contract on disk: an uploaded image file is retained when the owning write succeeds (claimed) and deleted when the request ends in an error (unclaimed). It exercises the three controllers that perform manual claiming — product create/update, user create, and example cover replace — asserting against the filesystem rather than API responses, since orphans only appear there.

## Key elements

- **`PNG_BYTES`** — A decodable PNG buffer generated once in `beforeAll` via `decodablePng()`; used as the `.attach()` payload in every test.
- **`uploadedFiles()`** — Returns the list of regular files (excluding subdirectories like `thumbs/`) currently in the upload directory.
- **`settled(isDone)`** — Thin wrapper over `eventually(isDone, 1000)` that polls until the close-hook deletion (or non-deletion) is observable on disk.
- **`IMAGE`** — Constant `{ filename: 'upload.png', contentType: 'image/png' }` passed to every `.attach()` call.
- **Four `describe` blocks** — `POST /products`, `PUT /products/:id`, `POST /users`, `PUT /examples/:id/cover`. Each contains a success case (expect 201/200, one file on disk) and a failure case (expect 422/404, zero files on disk).

## Relationships

- **`tests/support/http.ts`** — Supplies `api()`, `authenticateAs()`, and `authenticateAsRole()` for issuing authenticated requests.
- **`tests/support/file-sandbox.ts`** — `emptyFileSandbox` runs in `afterEach` to wipe the sandbox directory between tests.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` initializes the test database at the top of the file.
- **`tests/support/images.ts`** — Provides `decodablePng()` (generates the test image) and `publicDirectory()` (resolves the upload path).
- **`tests/support/eventually.ts`** — The polling primitive underlying `settled()`.
- **`tests/support/ids.ts`** — `MISSING_ID` used to trigger 404 paths.
- **`src/modules/locales/tests/factories.ts`** — `givenLocale('en')` seeded in `beforeEach` so product/user factories succeed.
- **`src/modules/products/tests/factories.ts`** — `createProduct()` seeds a product for the `PUT /products/:id` tests.
- **`src/modules/users/tests/factories.ts`** — `createUser()` creates a second user for the ownership-failure case in the example-cover tests.
- **`src/modules/example/tests/factories.ts`** — `createExample()` seeds an example owned by the caller or by another user.

## Notes

- **Success-case `settled(() => false)`** is a deliberate no-op wait. It gives the (non-existent) deletion close-hook a moment to *not* fire, making the "file still present" assertion deterministic rather than a race.
- **Deletion is asynchronous relative to the response.** The close hook fires after the HTTP answer is sent, so failure-case tests must poll via `settled` instead of asserting synchronously.
- **`uploadedFiles()` filters by `isFile()`** to ignore the `thumbs/` subdirectory that sharp or the broker may create alongside the main image.
- The `UPLOAD_DIRECTORY` non-null assertion (`!`) is safe because `setup-file-sandbox.ts` (a Jest global setup) assigns it before any test-file code executes; the assertion exists only to satisfy the type checker.
- Tests run against a **no-broker** configuration, so image digesting (sharp decode) happens inline rather than being deferred to a worker.
