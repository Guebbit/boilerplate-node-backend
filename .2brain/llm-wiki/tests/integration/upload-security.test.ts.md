---
source: tests/integration/upload-security.test.ts
sha256: d457900d200ff097878c55d6839b785c6ecabb3aeeb4ef305c808002aa3b97d8
generated_at: 2026-10-15T12:55:40.949856+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/upload-security.test.ts

## Purpose

Integration tests for the `PATCH /account` avatar-upload route and the static-serving of the upload directory. The focus is on what actually reaches the filesystem (not just HTTP status codes), guarding against client-controlled `Content-Type`, filename, and extension being used to store executable content, exceed size limits, or be served with a dangerous MIME type. A final block pins that `POST /account/signup` accepts no file at all.

## Key elements

- **`uploadAvatarWith(content, filename, contentType)`** — Authenticates as `user`, then issues `PATCH /account` with a multipart file attachment. The central helper every test uses to drive a real upload.
- **`uploadedFiles()`** — Lists regular files (excluding subdirectories like `thumbs/`) in the resolved upload directory, so assertions can confirm what a request left on disk.
- **`PNG_BYTES`** (set in `beforeAll`) — A real 4×4 PNG generated via `sharp`, needed because the digest pipeline decodes every upload inline; a magic-byte stub would 500.
- **`describe('upload content validation')`** — Rejects HTML/SVG/PHP disguised as PNG; accepts a genuine PNG; drops a real image whose declared type is non-image; rejects a file exceeding `maxUploadBytes()`.
- **`describe('serving the upload directory')`** — Verifies correct `Content-Type`, `cross-origin-resource-policy`, `x-content-type-options`; confirms stored extension is derived from declared type (not client filename); blocks dotfiles, directory listing, and path-traversal escapes.
- **`describe('signup takes no upload')`** — Confirms a multipart signup with an attached file is refused and writes nothing.

## Relationships

- **`src/infrastructure/config/store.ts`** — Imports `currentEnvironment` to resolve `NODE_PUBLIC_PATH` and compute `UPLOAD_DIRECTORY`.
- **`src/infrastructure/http/middlewares/upload.ts`** — Imports `maxUploadBytes` to build an oversized buffer in the size-limit test (reads the cap from the adapter rather than restating a constant).
- **`tests/support/http.ts`** — Imports `api` and `authenticateAs` for making authenticated/unauthenticated HTTP requests.
- **`tests/support/file-sandbox.ts`** — Imports `emptyFileSandbox`, called in `afterEach` to guarantee each test starts from an empty upload directory.
- **`tests/support/setup-test-db.ts`** — Calls `setupTestDb()` at module top level to ensure a clean database before any test runs.

## Notes

- The non-null assertion on `NODE_PUBLIC_PATH!` is safe because `setup-file-sandbox.ts` (a test setup file) assigns it before any test file's top-level code executes; the `!` only satisfies the compiler.
- `uploadedFiles()` deliberately filters to files only — the `thumbs/` derivative directory sits alongside uploads and is irrelevant to these assertions.
- The size-limit test constructs the oversized buffer as `PNG_BYTES + (maxUploadBytes() + 1024)` bytes of padding, so the PNG header remains valid and the rejection is purely size-based.
- The path-traversal tests (`/../package.json`, `/%2e%2e/…`) pin `express.static`'s resolution behaviour as a regression guard rather than assuming it.
