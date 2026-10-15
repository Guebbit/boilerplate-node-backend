---
source: src/modules/products/tests/integration/image-clear.test.ts
sha256: 0474f9c23ab5dc4457d8506bb8a73c2e326f0b1c3ed469b83256d8d54094ffae
generated_at: 2026-10-15T11:48:02.116497+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/tests/integration/image-clear.test.ts

## Purpose

Integration test that verifies the `imageUrl: null` path of `productService.updateById`. It confirms the field is truly unset in MongoDB (no placeholder written) and that the old image file plus its thumbnail are removed from disk **only after** the save succeeds. Real files in a temp directory and a real store are used because the point is *which* files get deleted—something a mocked filesystem cannot express.

## Key elements

- **`PICTURE` / `THUMBNAIL`** – Constants for the expected on-disk paths of the image and its v1 thumbnail.
- **`root`** – A per-test temp directory (`mkdtemp`) that stands in for the public file root.
- **`beforeEach`** – Creates the directory tree, writes stub `picture` and `thumbnail` files, and calls `setEnvironment({ NODE_PUBLIC_PATH: root })`.
- **`afterEach`** – Recursively removes the temp root.
- **`storedRow(id)`** – Helper that returns the raw MongoDB document via `productModel.findById(id).lean()`, bypassing Mongoose virtuals/defaults.
- **`describe('productService.updateById — imageUrl: null')`** – Four cases:
  1. Field is unset on disk (no `imageUrl`/`thumbnailUrl` key present).
  2. Both the picture and thumbnail files are deleted after the save.
  3. An update that does *not* mention `imageUrl` leaves files and the document untouched.
  4. Sending `imageUrl: null` on a product that never had an image is a successful no-op.

## Relationships

- **`src/modules/products/services/index.ts`** – The system under test; only `updateById` is called.
- **`src/modules/products/model.ts`** – `productModel` is imported to run raw `.lean()` queries for assertions.
- **`src/modules/products/tests/factories.ts`** – `createProduct` seeds a product (optionally with image fields) for each test.
- **`tests/support/callers.ts`** – Provides `testCallerContext` passed as the caller argument to `updateById`.
- **`tests/support/environment.ts`** – `setEnvironment` points `NODE_PUBLIC_PATH` at the per-test temp root so the service resolves file paths correctly.
- **`tests/support/setup-test-db.ts`** – `setupTestDb()` initialises the test MongoDB instance.

## Notes

- The test deliberately uses **real files** (`writeFile`, `existsSync`, `rm`) rather than a mocked `fs`, because asserting *which* paths are deleted is the core concern.
- `storedRow` uses `.lean()` specifically to see the raw stored shape—Mongoose may inject default values on a hydrated document that would mask an "unset" field.
- Cleanup is per-test (`afterEach` removes the entire temp root), so there is no cross-test file leakage.
