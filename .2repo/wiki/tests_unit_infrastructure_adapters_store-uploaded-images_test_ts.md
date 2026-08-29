# tests/unit/infrastructure/adapters/store-uploaded-images.test.ts

## Purpose

Unit tests for the `storeUploadedImages` Express middleware, which is the single point that commits multer-staged temporary files into permanent object-storage. The tests verify that the middleware's error-handling and cleanup logic is correct—specifically that failures never leave orphaned storage objects, undeleted temp files, or silent success on a broken image—while the storage and filesystem layers themselves are fully mocked.

## Key elements

- **`run(request)`** — Helper that invokes `storeUploadedImages(req, res, next)` and resolves the promise with whatever is passed to `next`, converting the callback-style middleware into an awaitable.
- **`uploaded(filePath)`** — Minimal factory for a `Multer.File`-shaped object (`{ path }`) used to populate `request.file` or `request.files`.
- **Mocked modules**
  - `@infrastructure/adapters/image-store` → `imageStore.put` / `imageStore.remove` (Jest fns).
  - `@infrastructure/adapters/filesystem` → `deleteFile` / `moveFile` (Jest fns).
- **Test cases**
  - Single upload: `put` called with staged path; `storedImageUrls` recorded on the request.
  - Multi-file upload (`.array()` / `.fields()` shape): all files committed in order.
  - No file on request: middleware passes through without calling `put`.
  - Store rejects: error is forwarded via `next(err)`.
  - Store rejects (multi-file): both staged files deleted via `deleteFile`.
  - Partial failure (one stored, one not): the already-stored object is removed via `imageStore.remove`, staged files are deleted, and `storedImageUrls` is never set.

## Relationships

- **`src/infrastructure/adapters/storage.ts`** — Source of the `storeUploadedImages` middleware under test. This test file is its primary behavioural contract for the staging→storage transition and its failure/rollback semantics.

## Notes

- The middleware communicates errors by calling `next(err)` rather than throwing; the `run` helper relies on that. Assertions use `resolves.toBe(failure)` / `resolves.toBeInstanceOf(Error)` accordingly.
- `request.files` (array) and `request.file` (single) are both valid Multer shapes the middleware must handle; the tests cover both.
- `moveFile` is mocked but never asserted on in the current test suite—likely a leftover from an earlier implementation or reserved for a future path.
- The tests never touch the real filesystem or object store; all I/O is replaced by Jest mocks, so they run in a hermetic environment.
