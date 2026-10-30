---
source: src/modules/users/tests/integration/image-clear.test.ts
sha256: 04f28ecce91b604801324e8d0a8ed8dc28e2edb56bfc62ae2cf80bfb0fd599dc
generated_at: 2026-10-29T06:20:54.845687+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/tests/integration/image-clear.test.ts

## Purpose

Integration test verifying that setting `imageUrl: null` on a user unsets both `imageUrl` and `thumbnailUrl` on the stored document **and** deletes the actual avatar + thumbnail files from disk. It uses a real temp directory and a real database (not mocks) so it can assert *which* files are removed after the save lands.

## Key elements

- **`root`** – Temp directory (created via `mkdtemp` in `beforeEach`) that stands in for the production file root; cleaned up in `afterEach`.
- **`AVATAR` / `THUMBNAIL`** – Fixed relative paths (`/images/avatar-abc.png`, `/images/thumbs/v1/avatar-abc.webp`) pre-written to disk so the service has real files to delete.
- **`storedRow(id)`** – Reads the user document with Mongoose `.lean()` to bypass virtuals/defaults, so assertions on *absence* of a key are reliable.
- **`beforeEach`** – Creates the nested directory tree, writes placeholder files, and calls `setEnvironment({ NODE_PUBLIC_PATH: root })` so the service resolves file paths against the temp dir.
- **`afterEach`** – Recursively removes the temp dir.
- **`describe('userService.updateById — imageUrl: null')`** – Four test cases:
  1. Unsets `imageUrl` and `thumbnailUrl` on the document (no placeholder written).
  2. Deletes both the avatar and thumbnail files after the save completes.
  3. Leaves files intact when the update only touches an unrelated field (`username`).
  4. Succeeds as a no-op for a user who never had an image.

## Relationships

- **`src/modules/users/services/index.ts`** — Source of `userService`; its `updateById` method is the system under test.
- **`src/modules/users/model.ts`** — Source of `userModel`; used by `storedRow` to read the raw document.
- **`src/modules/users/tests/factories.ts`** — `createUser` builds seeded user documents with or without image fields.
- **`tests/support/callers.ts`** — `callerContextAs('admin')` supplies the authorization context required by `updateById`.
- **`tests/support/environment.ts`** — `setEnvironment` swaps `NODE_PUBLIC_PATH` so the service's file-system operations target the temp dir.
- **`tests/support/setup-test-db.ts`** — `setupTestDb` boots a real MongoDB instance for the integration run.

## Notes

- `storedRow` deliberately uses `.lean()` — a plain Mongoose `findById` would re-apply schema defaults and could mask a truly-absent key.
- The tests assert file deletion *after* `await userService.updateById(...)` resolves, confirming the delete is ordered post-save (the file must not be removed before the write commits).
- `NODE_PUBLIC_PATH` is the environment variable the service reads to locate files on disk; pointing it at the temp dir is what makes the real-file assertions meaningful.
