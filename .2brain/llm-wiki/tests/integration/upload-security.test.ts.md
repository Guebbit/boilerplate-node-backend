---
source: tests/integration/upload-security.test.ts
sha256: 8e12abc5a6c6c9b232741042ad224c7067eced659bfc7c48f90dd17f88135e87
generated_at: 2026-09-23T20:08:51.009025+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/upload-security.test.ts

## Purpose

Integration test suite that verifies the `POST /account/signup` upload path enforces server-side content validation and that the static-file serving layer is secure. It asserts against the **filesystem** (what actually landed on disk) and the **response headers** (what a browser would do with the bytes), not merely against HTTP status codes.

## Key elements

- **`PNG_BYTES`** — a real 4×4 PNG generated via `sharp` in `beforeAll`; must be genuinely decodable because the digest pipeline calls `sharp` to process it.
- **`UPLOAD_DIRECTORY`** — resolved absolute path (`NODE_PUBLIC_PATH/images`) that every assertion inspects.
- **`uploadedFiles()`** — lists regular files (excludes `thumbs/`) in the upload directory so tests can confirm nothing was stored.
- **`signupWith(content, filename, contentType)`** — posts a signup form with a multipart file attachment; the workhorse for every test case.
- **`describe('upload content validation')`** — rejects HTML/SVG/PHP disguised as PNG (422 + empty disk), accepts a real PNG, drops a PNG declared as `application/pdf` (201 + empty disk), and refuses files over `maxUploadBytes()` (400 + empty disk).
- **`describe('serving the upload directory')`** — verifies correct `Content-Type`, `cross-origin-resource-policy: cross-origin`, `x-content-type-options: nosniff`; confirms the stored extension comes from declared type (not filename) so a file named `payload.html` still resolves to `.png`; blocks dotfiles, directory listing, and `..` / `%2e%2e` path-traversal attempts.

## Relationships

- **`src/infrastructure/http/middlewares/upload.ts`** — imports `maxUploadBytes()` to size the oversized-file test from the same source the middleware uses; tests exercise the `fileFilter` logic defined there.
- **`src/modules/users/tests/factories.ts`** — imports `PLAIN_PASSWORD` to fill the signup form fields.
- **`tests/support/file-sandbox.ts`** — imports `emptyFileSandbox`, called in `afterEach` to wipe the upload directory between tests.
- **`tests/support/http.ts`** — imports `api()` for issuing real HTTP requests against the running server.
- **`tests/support/setup-test-db.ts`** — imports `setupTestDb()` to reset the database before each test.

## Notes

- The decisive assertion in every rejection test is `uploadedFiles()` being `[]`, not the status code. A 201 with no file on disk is acceptable (multer treats a dropped file as a no-op); a 422 with a file on disk is the real failure.
- The test uses a **decodable** PNG rather than a magic-byte stub because `quarantineUploadedImages` calls `sharp` to decode; a stub would 500 with "unsupported image format," which is not the behavior under test.
- The oversized-file test reads `maxUploadBytes()` from the adapter instead of hardcoding a number, so it stays correct if the limit changes.
- `process.env.NODE_PUBLIC_PATH!` uses a non-null assertion because the file-sandbox sandbox sets it before any test file's top-level code executes; the `!` only satisfies the compiler.
- The serving tests pin `cross-origin-resource-policy: cross-origin` explicitly because Helmet's default (`same-origin`) would cause a cross-port SPA to fetch the image bytes successfully but refuse to render them.
- Extension derivation (from declared `Content-Type`, not the client filename) is the mechanism that prevents a file named `shell.html` from being served as `text/html` and executing script in a PNG metadata chunk.
