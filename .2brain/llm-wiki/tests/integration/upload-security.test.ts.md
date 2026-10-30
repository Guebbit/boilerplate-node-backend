---
source: tests/integration/upload-security.test.ts
sha256: a9e70a1c874eeecff29abd7ee71cef427eed10eaf65876e1fffb22946337ac49
generated_at: 2026-10-29T07:05:01.398407+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/upload-security.test.ts

## Purpose

End-to-end security tests for the image-upload pipeline. Unlike typical API tests that only check HTTP responses, these tests assert on the **filesystem** — the question is "what is now stored," not "what did the API answer." They cover content validation (rejection of disguised payloads, size limits), the serving layer (correct content types, no XSS via extension, no directory traversal), and pin that the signup endpoint cannot write files to disk at all.

## Key elements

- **`UPLOAD_DIRECTORY`** — Resolved path to `publicDirectory()/images`; the target of all filesystem assertions.
- **`PNG_BYTES`** — A genuinely decodable PNG generated once in `beforeAll` via `decodablePng()`. Must be real (not a magic-byte stub) because the digest pipeline decodes it with sharp.
- **`uploadedFiles()`** — Lists regular files (excluding directories like `thumbs/`) in the upload directory, so a test can verify what a request left behind.
- **`uploadAvatarWith(content, filename, contentType)`** — Signs in as `'user'`, then `PATCH /account` with a multipart attachment of the given buffer, filename, and claimed content-type.
- **`afterEach(emptyFileSandbox)`** — Guarantees every test starts with an empty upload directory.
- **`describe('upload content validation')`** — Rejects HTML/SVG/PHP payloads disguised as PNG (422, nothing on disk), accepts a real PNG (200, one file), rejects a real image declared as `application/pdf` (415), and rejects oversized files (413).
- **`describe('serving the upload directory')`** — Verifies stored images return `image/*` content-type with `cross-origin` CORP and `nosniff` headers; confirms stored extension is derived from declared type (not client filename) to prevent stored XSS; rejects dotfiles, directory listing, and path-traversal attempts.
- **`describe('signup takes no upload')`** — Pins that `POST /account/signup` with a multipart body is rejected (≥ 400) and writes nothing to disk.

## Relationships

- **`src/infrastructure/http/middlewares/upload.ts`** — Exports `maxUploadBytes`, used to construct an oversized buffer in the size-limit test (read from the adapter rather than hardcoded). The middleware's `fileFilter` is the component under test for content-type validation.
- **`tests/support/file-sandbox.ts`** — Provides `emptyFileSandbox`, called in `afterEach` to clean the upload directory between tests.
- **`tests/support/http.ts`** — Provides the `api()` supertest wrapper and `authenticateAs` helper used by every request in the file.
- **`tests/support/images.ts`** — Provides `decodablePng()` (generates a sharp-decodable PNG buffer) and `publicDirectory()` (base path for the public static directory).
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` is called at module top-level to initialise the test database before any test runs.

## Notes

- Filesystem assertions are deliberately the primary check; HTTP status is secondary. A test passing on status but failing on `uploadedFiles()` would mean the security boundary was bypassed.
- `PNG_BYTES` must be a fully decodable image. A header-only stub returns "unsupported image format" from sharp during the inline digest step (`quarantineUploadedImages`), causing a 500 that obscures the behaviour under test.
- The oversized-file test allocates `maxUploadBytes() + 1024` (not exactly `+1`) to stay safely past the boundary regardless of internal rounding.
- `uploadedFiles()` explicitly filters to `isFile()` to ignore the `thumbs/` derivative directory that the digest pipeline creates alongside uploads.
- The "serving" tests assert `cross-origin` for `cross-origin-resource-policy` because Helmet's default `same-origin` would block the frontend (on a different port) from rendering the image.
