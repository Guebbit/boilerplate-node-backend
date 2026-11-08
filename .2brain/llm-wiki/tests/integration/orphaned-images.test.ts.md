---
source: tests/integration/orphaned-images.test.ts
sha256: a6909e1853c63c1d418f88bbfe83245268b6ed93d65867bc941ecffa2a8a2abe
generated_at: 2026-11-08T09:43:51.252839+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/orphaned-images.test.ts

## Purpose

Integration test for the orphaned-image reaper (`reapOrphanedImages`). It exercises the full path—real MongoDB, real sandboxed filesystem—to verify that an old file no document references is deleted, a referenced file survives, a file younger than the reaping threshold is spared, and the sweep is scoped to the collections it is explicitly told to scan.

## Key elements

- **`imagesDirectory()`** — resolves the absolute path to the public originals folder using `publicRoot()` + `IMAGES_SEGMENT`.
- **`imageAged(name, ageHours)`** — writes a stub file into the images directory and backdates its mtime/ctime with `utimes`, returning the file path.
- **`documentNaming(imageUrl)`** — inserts a single document into the `products` collection with an `imageUrl` field, simulating a live reference.
- **`describe('reapOrphanedImages')`** — four `it` blocks covering: orphan removed + referenced kept; fresh file spared; thumbnail URL counts as a reference to the original; and collection scoping (a reference in an unlisted collection does *not* protect the file).

## Relationships

- **`src/infrastructure/adapters/orphaned-images.ts`** — source of `reapOrphanedImages`, the function under test. The test calls it with a collection-name array (`['products']`) and asserts on its returned `{ originalsReaped }` count.
- **`src/infrastructure/adapters/image-store.ts`** — provides `IMAGES_SEGMENT` and `publicRoot()` so the test knows *where* on disk the reaper will look.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` is invoked at module top level to establish a real Mongoose connection before any test runs.
- **`tests/support/file-sandbox.ts`** — supplies `emptyFileSandbox` (called in `afterEach` to reset the public directory) and `fileExists` (used in every assertion to check whether a file survived the sweep).

## Notes

- File "age" is simulated via `utimes`, not a real sleep; `ageHours: 0` means "just created," and the reaper's internal threshold (apparently ~1 hour) is what distinguishes it from the 5-hour-old orphans.
- The thumbnail test (`thumbnailUrl: '/images/thumbs/with-thumb.jpg'` protecting `with-thumb.jpg`) documents a non-obvious convention: the reaper must strip the `/thumbs/` prefix and extension to match a thumbnail URL back to its original filename.
- `reapOrphanedImages` accepts an explicit list of collections to scan; it does **not** enumerate the database. A reference in any other collection is invisible to the sweep.
- `setupTestDb()` runs once at import time (not inside a `beforeAll` hook), so the connection is established before the test framework begins.
