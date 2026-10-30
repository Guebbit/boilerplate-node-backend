---
source: src/modules/products/tests/integration/image-clear.test.ts
sha256: 838b76541e36797a81623eb77e9c2e5295d949ae28c58f2075ee39b58de9f5e6
generated_at: 2026-10-29T05:32:35.375613+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/tests/integration/image-clear.test.ts

## Purpose

Integration test for the "clear image" path of `productService.updateById`. It verifies that passing `imageUrl: null` both unsets `imageUrl` and `thumbnailUrl` in the stored document *and* deletes the old picture and its thumbnail from the filesystem. Real files in a temp directory and a real test DB are used (rather than a mocked store) so the test can assert *which* files are removed.

## Key elements

- **`PICTURE` / `THUMBNAIL`** — constant relative paths (`/images/picture-abc.png`, `/images/thumbs/v1/picture-abc.webp`) that represent the file layout a finished digest would leave behind.
- **`root`** — per-test temp directory created via `mkdtemp`; both test files are written under it.
- **`storedRow(id)`** — helper that calls `productModel.findById(id).lean()` to read the raw MongoDB document with no Mongoose virtuals or defaults.
- **`beforeEach`** — creates the temp dir tree, writes the two placeholder files, and calls `setEnvironment({ NODE_PUBLIC_PATH: root })` so the service resolves file paths against the temp dir.
- **`afterEach`** — recursively removes the temp dir.
- **Four test cases** in `describe('productService.updateById — imageUrl: null')`:
  - Unsets both URL fields on disk without writing a placeholder value.
  - Deletes both the picture and thumbnail files after the save.
  - Leaves files untouched when the update payload doesn't mention `imageUrl`.
  - Is a no-op (still returns `success: true`) for a product that never had an image.

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/modules/products/services/index.ts` | SUT — `productService.updateById` is the function under test. |
| `src/modules/products/model.ts` | `productModel.findById(...).lean()` is used to inspect the raw stored document after the update. |
| `src/modules/products/tests/factories.ts` | `createProduct` seeds products (with or without image URLs) before each assertion. |
| `tests/support/callers.ts` | `testCallerContext` supplies the auth/caller argument expected by the service method. |
| `tests/support/environment.ts` | `setEnvironment` points `NODE_PUBLIC_PATH` at the temp dir so file paths resolve to real files. |
| `tests/support/setup-test-db.ts` | `setupTestDb()` initialises the in-memory/test MongoDB instance at module load. |

## Notes

- `.lean()` is used deliberately so Mongoose does not apply a schema-level default (e.g. `default: undefined`) that would make the field *appear* present. The assertions check for property absence, not a `null` value.
- File deletion is asserted *after* the `updateById` call resolves, matching the documented contract that files are removed only once the save has landed.
- The "unrelated update" test guards against an over-eager cleanup: any update that doesn't touch `imageUrl` must not delete files.
