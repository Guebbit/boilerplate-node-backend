---
source: src/modules/users/tests/integration/image-clear.test.ts
sha256: 04f28ecce91b604801324e8d0a8ed8dc28e2edb56bfc62ae2cf80bfb0fd599dc
generated_at: 2026-11-08T08:54:48.083674+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/tests/integration/image-clear.test.ts

## Purpose

Integration tests for `userService.updateById` when called with `{ imageUrl: null }`. They verify that clearing a user's avatar unsets both `imageUrl` and `thumbnailUrl` in the stored document **and** deletes the old avatar file and its thumbnail from disk — using real files in a temp directory and a real store, because a mocked store cannot confirm *which* files are removed.

## Key elements

- **`AVATAR` / `THUMBNAIL`** — constant paths (`/images/avatar-abc.png`, `/images/thumbs/v1/avatar-abc.webp`) representing the files a finished upload would have produced.
- **`storedRow(id)`** — helper that returns the raw Mongoose document via `.lean()`, bypassing schema defaults so assertions see exactly what MongoDB holds.
- **`beforeEach`** — creates a unique temp directory (`mkdtemp`), writes dummy avatar + thumbnail files into it, and points `NODE_PUBLIC_PATH` at that root.
- **`afterEach`** — recursively removes the temp directory.
- **Four test cases** under `userService.updateById — imageUrl: null`:
  1. Unsets `imageUrl` and `thumbnailUrl` (property absent, not empty string).
  2. Both files are gone from disk after the save.
  3. An unrelated update (e.g. `username`) leaves the files and document untouched.
  4. Clearing on a user who never had an image is a successful no-op.

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/modules/users/services/index.ts` | Imports `userService` — the unit under test (`updateById`). |
| `src/modules/users/model.ts` | Imports `userModel` to read the raw stored document via `.findById().lean()`. |
| `src/modules/users/tests/factories.ts` | Imports `createUser` to seed users with or without image fields. |
| `tests/support/callers.ts` | Imports `callerContextAs('admin')` to supply the caller context required by `updateById`. |
| `tests/support/environment.ts` | Imports `setEnvironment` to redirect `NODE_PUBLIC_PATH` to the temp root. |
| `tests/support/setup-test-db.ts` | Calls `setupTestDb()` once at module level to initialise the test database. |

## Notes

- Tests use **real filesystem I/O** (`mkdtemp`, `writeFile`, `existsSync`) rather than mocked `fs` — the module docstring explicitly states this is to verify *which* files are deleted, something a mock cannot assert.
- `.lean()` on the model query is deliberate: it skips Mongoose virtuals and defaults so the assertion `not.toHaveProperty('imageUrl')` proves the field is truly absent from the BSON document, not merely defaulted to `undefined` by the schema.
- The temp directory is created per-test (`beforeEach`) and removed per-test (`afterEach`); there is no shared state between test cases.
