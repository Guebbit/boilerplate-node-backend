# tests/unit/infrastructure/adapters/quarantine-uploaded-images.test.ts

## Purpose

Unit tests for the `quarantineUploadedImages` Express middleware. The file verifies that staged Multer uploads are correctly committed into quarantine (or digested inline when no broker is running), and that every failure path triggers appropriate cleanup so no orphaned files remain. The store and digest pipeline are fully mocked; the middleware's orchestration logic is what is under test.

## Key elements

- **`describe('broker configured')`** — asserts the happy path records `request.quarantinedImageKeys`, multi-file ordering, no-op when no file is present, failure propagation via `next(error)`, staged-file deletion on store rejection, and rollback of a partially-succeeded batch (`removeQuarantined` + `deleteFile`).
- **`describe('no broker configured')`** — asserts that `digestQuarantinedImage` runs inline, results land on `request.storedImageUrls` / `request.storedThumbnailUrls`, `quarantinedImageKeys` stays undefined, and a digest rejection cleans up the quarantine file and fails the request.
- **`uploaded(filePath)`** — factory returning a minimal `Express.Multer.File`-shaped object.
- **`run(request)`** — wraps the middleware call in a `Promise` that resolves with the value passed to `next`, enabling `await`-based assertions.
- **Mocks** — `imageStore` (quarantine/removeQuarantined), `deleteFile`, `moveFile`, `isQueueEnabled`, `publishToQueue`, `digestQuarantinedImage`.

## Relationships

- **`src/infrastructure/adapters/storage.ts`** — the sole system under test; exports `quarantineUploadedImages`, the Express middleware this file exercises.

## Notes

- The middleware signals failure by calling `next(error)` rather than throwing; tests assert `run(...)` resolves *to* the error object, not that it rejects.
- Multer populates `request.file` (`.single()`) or `request.files` (`.array()` / `.fields()`); both shapes are covered.
- On partial multi-file failure the test asserts **both** `removeQuarantined` (for the file that made it into quarantine) and `deleteFile` for every staged path — cleanup is two-step and file-level.
- `request.quarantinedImageKeys` and `request.storedImageUrls` / `storedThumbnailUrls` are mutually exclusive per request; the "no broker" block explicitly asserts the former is `undefined`.
