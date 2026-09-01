# tests/integration/upload-security.test.ts

## Purpose

Integration tests that verify the unauthenticated `POST /account/signup` upload route enforces real content validation (not just client-declared types) and that the `express.static` serving layer for the public upload directory is safe. Tests assert on the filesystem state — what is actually stored on disk — rather than only on HTTP status codes, because the security question is "what is now available to read."

## Key elements

- **`PNG_BYTES`** (module-level, set in `beforeAll`) — a 4×4 RGB PNG generated with `sharp`, used as the legitimate image fixture. A decodable image is required because the digest/quarantine pipeline calls `sharp` on every non-brokered upload; a magic-byte stub would 500.
- **`UPLOAD_DIRECTORY`** — resolved from `NODE_PUBLIC_PATH` (default `public`), joined with `images`. All filesystem assertions target this path.
- **`uploadedFiles()`** — returns only regular files in `UPLOAD_DIRECTORY` (excludes the `thumbs/` subdirectory created by the digest pipeline).
- **`signupWith(content, filename, contentType)`** — helper that posts a multipart signup form with an attached `imageUpload` part, controlling all three client-writable fields (body bytes, filename, part `Content-Type`).
- **`describe('upload content validation')`** — cases: disguised HTML/SVG/PHP rejected with 422 and nothing stored; a real PNG accepted with 201 and one new file; a real PNG declared as `application/pdf` dropped (201, no file); an oversized file (exceeds `maxUploadBytes()`) rejected with 400.
- **`describe('serving the upload directory')`** — cases: stored image served with correct `Content-Type`, `Cross-Origin-Resource-Policy: cross-origin`, and `X-Content-Type-Options: nosniff`; a file named `.html` stored as `.png` and never served as HTML; dotfiles (`.env`) return 404; directory listing returns 404; path-traversal attempts (`/../`, `%2e%2e`) return ≥ 400.

## Relationships

- **`src/infrastructure/adapters/storage.ts`** — imports `maxUploadBytes()` to compute the oversized-fixture size, so the test reads the actual configured cap rather than hard-coding a number.
- **`tests/support/http.ts`** — provides the `api()` helper used for all HTTP requests (signup POSTs and static-file GETs).
- **`tests/support/setup-test-db.ts`** — calls `setupTestDb()` once at module level so the signup route has a valid database connection.

## Notes

- **Filesystem cleanup is snapshot-based.** `beforeEach` records the directory listing; `afterEach` removes only files not in that snapshot. Tests that cause a file to be written must rely on this, or the upload directory accumulates fixtures and subsequent snapshots become stale.
- **`thumbs/` is intentionally excluded.** The digest pipeline creates a `thumbs/` subdirectory alongside uploads; `uploadedFiles()` filters to regular files only so cleanup does not delete thumbnails.
- **A 201 does not mean "stored."** Multer's contract is that a rejected/dropped file is not an error — the request still succeeds. Several tests assert `status 201` *and* that the file is absent, making the filesystem check the load-bearing assertion.
- **PNG must be decodable.** Since the inline digest (`quarantineUploadedImages`) calls `sharp` on every non-brokered upload, a header-only stub now triggers a 500 "unsupported image format," which is not the behavior under test. Always use the `sharp`-generated `PNG_BYTES`.
