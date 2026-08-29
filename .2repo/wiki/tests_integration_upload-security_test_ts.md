# tests/integration/upload-security.test.ts

## Purpose

Integration test that verifies `POST /account/signup` (the only upload route reachable without auth) rejects malicious payloads disguised as images and enforces file-size limits — asserting on the **filesystem** (what is actually stored) rather than only the HTTP status. A second block verifies the serving side: correct content types, safe headers, no directory listing, no dotfile exposure, and no path traversal out of the public directory.

## Key elements

- **`UPLOAD_DIRECTORY`** – Resolved path of the upload directory (`NODE_PUBLIC_PATH/images` or `public/images`). All filesystem assertions are relative to this.
- **`PNG_BYTES`** – Minimal 13-byte PNG header used as the "real image" fixture.
- **`uploadedFiles()`** – Returns the current file list in `UPLOAD_DIRECTORY`; the baseline for "did the request leave a file behind."
- **`signupWith(content, filename, contentType)`** – Builds a multipart `POST /account/signup` request with the given buffer/string, filename, and part-level `Content-Type`. Used by every test.
- **`describe('upload content validation')`** – Four tests: HTML/SVG/PHP disguised as PNG → 422 + nothing stored; real PNG → 201 + one new file; real PNG declared `application/pdf` → 201 + nothing stored (multer drops it silently); oversized buffer → 400 + nothing stored.
- **`describe('serving the upload directory')`** – Five tests: correct `Content-Type`/CORS/nosniff headers on a stored image; stored URL always ends `.png` regardless of original filename; dotfiles return 404; directory listing returns 404; path-traversal attempts (`/../`, encoded `..`) return ≥ 400.

## Relationships

- **`src/infrastructure/adapters/storage.ts`** – Imports `maxUploadBytes()` to size the oversized-file test buffer, so the limit is read from the adapter rather than hardcoded.
- **`tests/support/http.ts`** – Imports the `api()` helper that issues HTTP requests against the running test server.
- **`tests/support/setup-test-db.ts`** – Calls `setupTestDb()` once before the suite so each test runs against a clean database.

## Notes

- **Filesystem cleanup**: `beforeEach` snapshots the directory; `afterEach` deletes any file not in that snapshot. Skipping cleanup would let fixtures accumulate and break the "before" baseline on the next run.
- **Multer contract**: A file dropped by `fileFilter` (wrong declared type) does **not** produce an error response — the request still returns 201. The test asserts on the absence of a stored file, not on a non-2xx status.
- **Extension derivation**: The stored filename's extension comes from the declared MIME type, not the client-supplied filename. The "never serves as HTML" test pins this: a file named `payload.html` with `Content-Type: image/png` is stored as `.png`.
- **Environment dependency**: `UPLOAD_DIRECTORY` reads `NODE_PUBLIC_PATH`; if unset it defaults to `public/images`. Tests that assert on the filesystem will silently target the wrong directory if that variable is set unexpectedly.
