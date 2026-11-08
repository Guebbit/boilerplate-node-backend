---
source: tests/integration/upload-security.test.ts
sha256: b8e178886f910def2f71cd651670a1aa6a2c0c1c280bf8d0a71b508ef839d043
generated_at: 2026-11-08T09:50:22.554034+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/upload-security.test.ts

## Purpose

Integration tests that verify the `PATCH /account` avatar upload and the static-file serving layer actually protect the filesystem. Every test asserts on what ends up on disk (via `uploadedFiles()`), not just on the HTTP status, because the threat model is "what a client can write into the publicly-served directory," not "what the API replies." A final block confirms that `POST /account/signup` cannot be abused as a free disk-write primitive.

## Key elements

- **`UPLOAD_DIRECTORY`** – Resolved path (`publicDirectory()/images`) used by `uploadedFiles()` to inspect the disk.
- **`PNG_BYTES`** – A genuinely decodable PNG (built in `beforeAll` via `decodablePng()`); required because the digest pipeline runs `sharp` decode and a magic-byte stub would 500.
- **`uploadedFiles()`** – Lists only files (excludes the `thumbs/` sub-directory) in the upload directory; returns `[]` if the directory does not exist.
- **`uploadAvatarWith(content, filename, contentType)`** – Authenticates as `user`, then issues a `PATCH /account` multipart request with the given payload, filename, and declared Content-Type.
- **`describe('upload content validation')`** – Rejects HTML/SVG/PHP disguised as PNG (422, nothing on disk); accepts a real PNG (200, one file); rejects a real PNG declared as a non-image (415 with `ACCEPTED_UPLOAD_TYPES`); rejects an oversized file (413, size read from `maxUploadBytes()`).
- **`describe('serving the upload directory')`** – Verifies served images carry correct `Content-Type`, `cross-origin-resource-policy: cross-origin`, and `x-content-type-options: nosniff`; confirms the stored extension is derived from the declared type (never `.html`); blocks dotfile access, directory listing, and `..` / URL-encoded path traversal.
- **`describe('signup takes no upload')`** – Attaches a file to `POST /account/signup` and asserts the request fails (≥ 400) and nothing is written.

## Relationships

- **`src/infrastructure/http/middlewares/upload.ts`** – Imports `maxUploadBytes` to construct an oversized payload that exceeds the *actual* configured limit (avoids hardcoding a magic number that could drift).
- **`tests/support/file-sandbox.ts`** – Imports `emptyFileSandbox`, called in `afterEach` to remove all files (originals, thumbnails, quarantined) so each test starts from a clean directory.
- **`tests/support/http.ts`** – Imports `api` (request builder) and `authenticateAs` (returns a bearer token for the fixed `user` account).
- **`tests/support/images.ts`** – Imports `decodablePng` (async, returns a real PNG `Buffer`) and `publicDirectory` (resolves the Express static-root path at runtime).
- **`tests/support/setup-test-db.ts`** – Imports `setupTestDb`, invoked at module top-level to provision a clean test database before any test runs.

## Notes

- The decisive assertion in every upload test is `uploadedFiles()`, not the HTTP status. A 200 with a file on disk is a failure; a 422 with an empty directory is a pass.
- `PNG_BYTES` must be decodable by `sharp`. The codebase added an inline digest/quarantine step (`quarantineUploadedImages`) that decodes every broker-less upload; a header-only stub triggers "unsupported image format" → 500, which would mask the actual assertion.
- `maxUploadBytes()` is called at test time (lazy read from the middleware) rather than duplicated as a constant, so the test stays correct if the limit changes.
- The `!` on `UPLOAD_DIRECTORY` is a TypeScript non-null assertion for a compiler limitation; at runtime `publicDirectory()` is always set by the sandbox before any test module body executes.
- The stored-extension test (`payload.html` → `.png`) guards against a specific stored-XSS vector: `express.static` would serve a `.html` file as `text/html`, and PNG metadata chunks may legally embed `<script>`.
