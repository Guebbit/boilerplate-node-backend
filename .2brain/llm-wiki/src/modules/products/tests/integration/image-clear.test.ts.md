---
source: src/modules/products/tests/integration/image-clear.test.ts
source_sha256: fbc72a2dae881ef8bb2346c6042dd4e3edc8f571360655fea289c276f20afb56
context_sha256: 4a8a3c7fb9447ca9c695b727ad9fb2a822303d2d2045ab990ea9cde1ec6a463f
generated_at: 2026-11-22T07:16:34.806660+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/products/tests/integration/image-clear.test.ts

## Purpose
Integration test for `productService.updateById` when called with `imageUrl: null`. It verifies that the image fields are truly unset in MongoDB (no placeholder written) and that the old image file and its thumbnail are deleted from disk only after the save succeeds. It uses real files in a temp directory and a real store, because a mocked store cannot show *which* files are removed.

## Key elements
- `setupTestDb()` – sets up the test database for the suite.
- `root` / `beforeEach` / `afterEach` – create a temp directory (`image-clear-products-*`), write fixture files for the picture and thumbnail under it, point `NODE_PUBLIC_PATH` at it via `setEnvironment`, and remove the directory after each test.
- `PICTURE`, `THUMBNAIL` – URL paths of the fixture image and thumbnail, relative to `root`.
- `storedRow(id)` – reads the product with `productModel.findById(id).lean()`, so the raw stored document is seen with no Mongoose defaults applied.
- Test cases in `describe('productService.updateById — imageUrl: null')`:
  - Clearing unsets both `imageUrl` and `thumbnailUrl` on the stored document, with no placeholder.
  - Clearing deletes both the image file and its thumbnail from disk.
  - An update that doesn't mention the image (`{ active: false }`) leaves the file and stored `imageUrl` untouched.
  - Clearing on a product with no image succeeds, and `imageUrl` stays absent.

## Relationships
- `../../services` (`productService`) – the unit under test; `updateById(id, patch, testCallerContext)`.
- `../../model` (`productModel`) – used to read the stored document directly.
- `tests/factories` (`createProduct`) – creates products, optionally with `imageUrl` and `thumbnailUrl`.
- `@tests/setup-test-db` – provides the database setup.
- `@tests/callers` (`testCallerContext`) – the caller context passed to the service.
- `@tests/environment` (`setEnvironment`) – redirects `NODE_PUBLIC_PATH` to the temp directory so file deletions happen there.

## Notes
- The assertions use `not.toHaveProperty` on the lean document, so "unset" means the field is absent, not `null` or a default value.
- Tests assert file existence with `existsSync` on paths under the temp `root`, so the service resolves stored URLs against `NODE_PUBLIC_PATH`.
