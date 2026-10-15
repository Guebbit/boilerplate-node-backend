---
source: tests/integration/orphaned-images.test.ts
sha256: a6909e1853c63c1d418f88bbfe83245268b6ed93d65867bc941ecffa2a8a2abe
generated_at: 2026-10-15T12:49:17.526397+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/orphaned-images.test.ts

## Purpose

Integration test for `reapOrphanedImages` that exercises the full sweep against a real MongoDB connection and a sandboxed public directory. It verifies the core contract: files no document references are deleted, files that are referenced (by URL or by thumbnail) survive, files younger than one hour are spared, and only the explicitly listed collections are scanned.

## Key elements

- **`imageAged(name, ageHours)`** — helper that writes a placeholder file into the images directory and backdates its mtime via `utimes` to simulate age.
- **`documentNaming(imageUrl)`** — inserts a raw document into the `products` collection with an `imageUrl` field.
- **`imagesDirectory()`** — resolves the concrete path to the originals directory from `publicRoot()` + `IMAGES_SEGMENT`.
- **`describe('reapOrphanedImages')`** — four test cases covering: orphan removal vs. referenced retention, the 1-hour grace period, thumbnail-URL-to-original resolution, and collection-scoped scanning.
- **`afterEach(emptyFileSandbox)`** — tears down the sandboxed file tree after every test.

## Relationships

- **`src/infrastructure/adapters/orphaned-images.ts`** — exports `reapOrphanedImages`, the function under test.
- **`src/infrastructure/adapters/image-store.ts`** — exports `IMAGES_SEGMENT` and `publicRoot()`, used to locate where originals live on disk.
- **`tests/support/file-sandbox.ts`** — exports `emptyFileSandbox` (per-test cleanup) and `fileExists` (assertion helper that checks the sandboxed path).
- **`tests/support/setup-test-db.ts`** — exports `setupTestDb`, which opens a real Mongoose connection for the test suite.

## Notes

- The "young" grace threshold is **one hour**; the fresh-file test passes `ageHours: 0`.
- The thumbnail test shows `reapOrphanedImages` resolves a `/images/thumbs/<name>` reference back to the original `<name>` file — this is an implicit contract on the implementation, not on the test itself.
- Documents are inserted via `mongoose.connection.collection('products')` (raw driver) rather than a Mongoose model, so no schema validation is involved.
- The sandbox (`emptyFileSandbox`) is what makes `publicRoot()` safe to mutate; without it the tests would touch the real public directory.
