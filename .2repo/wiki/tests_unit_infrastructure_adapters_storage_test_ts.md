# tests/unit/infrastructure/adapters/storage.test.ts

## Purpose

Unit tests for the upload-security surface of `src/infrastructure/adapters/storage.ts`: the multer callbacks (`fileFilter`, `resolveUploadDestination`, `resolveUploadFilename`) and the post-upload content-validation middleware (`validateUploadedImages`). These functions constitute the repository's entire upload security boundary, and this file pins their behavioural guarantees (field whitelist, client-name discarding, MIME allow-list, byte-level content check, staged-file deletion on rejection) so that refactors must preserve them.

## Key elements

- **`fileOf(overrides)`** – factory that builds a default `Express.Multer.File` fixture (`imageUpload` / `holiday.png` / `image/png`) with partial overrides.
- **`accepted(file)`** – synchronous wrapper that invokes `fileFilter` with a stub callback and returns the boolean accept/reject result.
- **`capture(run)`** – runs a callback-style `(error, value) => void` function and returns both arms as an object, for synchronous multer callbacks.
- **`captureAsync(run)`** – Promise-wrapped variant of `capture`, for async callbacks (e.g. `resolveUploadDestination` which awaits `mkdir`).
- **`describe('maxUploadBytes')`** – asserts the value is read from `process.env.NODE_MAX_UPLOAD_BYTES` at call time (not import time) and falls back to 5 MiB for empty, non-numeric, zero, or negative inputs.
- **`describe('resolveUploadDestination')`** – asserts the staging directory is created on demand, that unknown field names are rejected (whitelist, not blacklist), and that the staging path never falls inside the public/served directory. Uses a real `mkdtemp` temp dir cleaned up in `afterEach`.
- **`describe('resolveUploadFilename')`** – asserts the filename is a 32-char hex string with a safe extension, is unique across 50 invocations, and falls back to `.bin` for unrecognised MIME types.
- **`describe('fileFilter')`** – asserts the MIME allow-list (accepts `image/png`, `image/jpeg`, `image/jpg`; rejects PDF, HTML, SVG, octet-stream) and that rejection results in `null` error + `false` accept (drop, not error).
- **`describe('validateUploadedImages')`** – tests the content-check middleware. Mocks `identifyImageFile` and `deleteFile` via `jest.mock` + `requireActual` spread; uses `requestWithFile` (single-file shape) and `requestWithFiles` (array shape) fixtures; verifies pass-through, mismatched-type rejection, non-image rejection, and that rejected files are deleted.
- **`runMiddleware(request)`** – resolves the middleware's `next` callback into a Promise for clean assertion.

## Relationships

- **`src/infrastructure/adapters/storage.ts`** – the module under test. All exported functions (`fileFilter`, `maxUploadBytes`, `resolveUploadDestination`, `resolveUploadFilename`, `uploadStagingPath`, `validateUploadedImages`) are imported directly.
- **`tests/support/stub.ts`** – provides the `asStub<T>()` type-assertion helper used to cast plain objects to `Request`, `FileFilterCallback`, and other typed fixtures without `as any`.

## Notes

- Tests are written against **behavioural guarantees** (security properties), not against current implementation lines. A refactor that keeps the guarantees should keep these green.
- Multer callbacks are `(request, file, callback)` and are otherwise untestable; the `capture`/`captureAsync` helpers exist solely to bridge that callback style into `expect()` assertions.
- `fileFilter` rejection is a **drop** (`null` error, `false` accept), not a request error. This is explicitly pinned because the intuitive "rejection = error" reading is wrong.
- `validateUploadedImages` mocks three modules (`image-signatures`, `filesystem`, `logger`) using the `jest.mock` + `requireActual` spread pattern so that only the specific function under test is replaced.
- Environment variables (`NODE_MAX_UPLOAD_BYTES`, `NODE_UPLOAD_STAGING_PATH`) are saved before each test and restored in `afterEach`; the `maxUploadBytes` tests specifically guard against the bug of reading the env var at import time.
- `resolveUploadDestination` tests use a **real** `mkdtemp` temp directory (not a mock) to verify that the function actually creates the directory, since multer will not do so.
