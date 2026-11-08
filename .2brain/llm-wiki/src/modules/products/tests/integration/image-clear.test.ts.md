---
source: src/modules/products/tests/integration/image-clear.test.ts
sha256: 838b76541e36797a81623eb77e9c2e5295d949ae28c58f2075ee39b58de9f5e6
generated_at: 2026-11-08T07:51:30.909566+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/tests/integration/image-clear.test.ts

## Purpose

Integration test for `productService.updateById` when `imageUrl: null` is passed. It verifies the field is truly *unset* in the database (not defaulted to `""`) and that the corresponding picture and thumbnail files are removed from disk — using a real temp directory and a real test database, because a mocked filesystem cannot confirm *which* files are deleted.

## Key elements

- **`PICTURE` / `THUMBNAIL`** – Fixed relative paths (`/images/picture-abc.png`, `/images/thumbs/v1/picture-abc.webp`) representing the files a completed image-upload pipeline would leave behind.
- **`storedRow(id)`** – Fetches the product via `productModel.findById(id).lean()` so Mongoose does not apply schema defaults (e.g. `""` for undefined) and the assertion sees the raw stored shape.
- **`beforeEach`** – Creates a `mkdtemp` root, writes real bytes to the picture and thumbnail paths, and points `NODE_PUBLIC_PATH` at that root via `setEnvironment`.
- **`afterEach`** – Recursively removes the temp root.
- **Four test cases** covering: (1) fields are absent from the stored doc, (2) both files are gone after the save, (3) files and fields are untouched when the update omits image fields, (4) no-op when the product never had an image.

## Relationships

- **`src/modules/products/services/index.ts`** – `productService.updateById` is the method under test.
- **`src/modules/products/model.ts`** – `productModel` is used in `storedRow` to read the raw document.
- **`src/modules/products/tests/factories.ts`** – `createProduct` builds the initial product document in the test DB.
- **`tests/support/callers.ts`** – `testCallerContext` supplies the caller identity required by the service.
- **`tests/support/environment.ts`** – `setEnvironment` overrides `NODE_PUBLIC_PATH` so the service resolves file paths against the temp root.
- **`tests/support/setup-test-db.ts`** – `setupTestDb` bootstraps the test database connection.

## Notes

- The entire point of using a real temp directory (rather than mocking `fs`) is to assert *which* files are deleted. Do not replace this with `jest.mock('fs')` without rethinking the test's purpose.
- `.lean()` is deliberate: without it Mongoose would fill in `""` for unset string fields, making the `not.toHaveProperty` assertions pass or fail depending on driver version rather than actual stored state.
- The test only covers the `imageUrl: null` path; it does not exercise re-uploading or thumbnail regeneration.
