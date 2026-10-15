---
source: src/modules/users/tests/integration/image-clear.test.ts
sha256: c73643b1817c330fc35bc22a3fe20151161186abec6a30c016f3629ec25ce919
generated_at: 2026-10-15T12:13:43.485747+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/tests/integration/image-clear.test.ts

## Purpose

Integration test verifying that `imageUrl: null` in `userService.updateById` unsets `imageUrl`/`thumbnailUrl` on the stored document **and** deletes the actual avatar file and its thumbnail from disk. It uses real files in a per-test temp directory and a real (test) store so the assertion targets *which* files disappear — something a mocked store cannot verify.

## Key elements

- **`AVATAR` / `THUMBNAIL`** – Constants holding the relative paths (`/images/avatar-abc.png`, `/images/thumbs/v1/avatar-abc.webp`) of the files pre-created under the temp root.
- **`storedRow(id)`** – Helper that reads a user document with `userModel.findById(id).lean()`, bypassing Mongoose virtuals/defaults so the test sees the raw stored shape.
- **`beforeEach`** – Creates a unique `mkdtemp` root, writes the two "on-disk" files, and points `NODE_PUBLIC_PATH` at that root via `setEnvironment`.
- **`afterEach`** – Recursively removes the temp root.
- **Four test cases** (all under `userService.updateById — imageUrl: null`):
  - Field is unset on disk (neither `imageUrl` nor `thumbnailUrl` present, no placeholder written).
  - Both the avatar and thumbnail files are deleted after the save lands.
  - An update that doesn't mention the image leaves the file and stored path untouched.
  - Clearing `imageUrl` on a user that never had one succeeds and changes nothing.

## Relationships

- **`src/modules/users/services/index.ts`** – The system under test; `userService.updateById` is called in every case.
- **`src/modules/users/model.ts`** – Provides `userModel` for the `storedRow` helper to read the raw document.
- **`src/modules/users/tests/factories.ts`** – `createUser` seeds users with or without an image.
- **`tests/support/callers.ts`** – `callerContextAs('admin')` supplies the auth context required by the service.
- **`tests/support/environment.ts`** – `setEnvironment` injects `NODE_PUBLIC_PATH` so the service resolves file paths into the temp root.
- **`tests/support/setup-test-db.ts`** – `setupTestDb()` (called at module top level) provisions the test database connection.

## Notes

- The tests deliberately avoid mocking the filesystem or the store. The module doc-comment states the point is *which files go*, which a mock cannot express.
- `.lean()` is used in `storedRow` specifically so Mongoose does not apply `default` values on read; without it, a field that was truly unset could appear with a default and mask the "no placeholder" assertion.
- Each test gets an isolated temp directory (`image-clear-users-*` prefix) to avoid cross-test file interference.
