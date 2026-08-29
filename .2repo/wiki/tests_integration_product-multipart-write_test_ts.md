# tests/integration/product-multipart-write.test.ts

## Purpose

Integration test verifying that the server correctly decodes string-typed fields (numbers, booleans) arriving via a multipart/form-data body when creating or updating a product with an image. This is the only test path that exercises the combination of a file attachment *and* typed scalar fields, since JSON-based suites already send native types and the frontend mock coerces values before sending.

## Key elements

- **`UPLOAD_DIRECTORY`** – Resolved filesystem path to the public images directory, derived from `NODE_PUBLIC_PATH` or falling back to `./public/images`.
- **`PNG_BYTES`** – A 12-byte buffer containing a valid PNG magic-number header; sufficient for `identifyImageFile()` to accept the upload without needing a real image file.
- **`uploadedFiles()`** – Returns the list of filenames currently in `UPLOAD_DIRECTORY` (empty if the directory doesn't exist). Used for before/after snapshots.
- **`beforeEach` / `afterEach` cleanup** – Snapshots existing files, then removes any new files after each test so the upload directory doesn't accumulate fixtures.
- **Five test cases** covering:
  - POST `/products` with a string `price` → asserts persisted value is a JS number (`101.5`).
  - PUT `/products/:id` with a string `price` → asserts decoded number (`42`).
  - String `'false'` for `active` → asserts decoded to boolean `false`.
  - Omitted `active` field → asserts default `true`.
  - Unparseable string `'not-a-number'` for `price` → asserts 422 and no leftover upload file.

## Relationships

- **`tests/support/http.ts`** – Imports `api` (Supertest-based request helper) and `authenticateAs` (returns a bearer token for a named role). All requests in this file go through these.
- **`tests/support/setup-test-db.ts`** – Imports `setupTestDb`, called once before the suite to prepare/seed the test database.

## Notes

- The file targets the server's `readInput` decoder (its `numbers`/`booleans` declarations) as the unit under test. Without that decoder, a string `'false'` is truthy and `'101.5'` would fail `z.number()` in the Zod schema.
- Assertions deliberately check **response body values**, not just status codes, because a 201 that persisted `price: '101.5'` (a string) would be a silent data-corruption bug.
- The `afterEach` cleanup is load-bearing: without it, successive runs leave orphaned files that corrupt the `before` snapshot and cause spurious "no new file" assertions.
- `PNG_BYTES` is not a renderable image—only the magic bytes matter for the server's content-type validation.
