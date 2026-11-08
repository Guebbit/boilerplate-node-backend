---
source: tests/unit/scripts/contracts/image-upload-encoding.test.ts
sha256: 0b020479c67c89674345f6b9b594d92f1dc1644919eeaead9891fc7e1449193d
generated_at: 2026-11-08T10:33:13.887041+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/scripts/contracts/image-upload-encoding.test.ts

## Purpose

Unit tests for `withImageUploadEncoding`, the post-bundle step that writes the root's `x-image-upload-types` list onto every multipart body carrying an `imageUpload` part and then removes the root key. The tests use a hand-built minimal OpenAPI document (via `asStub`) to verify which bodies get stamped and what the step rejects, without exercising any real operation logic.

## Key elements

- **`bundle(root)`** – Builds a throwaway `OpenApiDocument` with three routes (`/refs` POST, `/inline` PUT, `/plain` POST) to cover `$ref` schema, inline schema, and a body without an `imageUpload` part.
- **`stamped(document)`** – Convenience wrapper that calls `withImageUploadEncoding` in place and returns the mutated document.
- **`encodingOf(result, route, method)`** – Extracts `content['multipart/form-data'].encoding` for a given path/method so assertions read cleanly.
- **`TYPES`** – The root key/value used in happy-path cases: `{ 'x-image-upload-types': ['image/png', 'image/webp'] }`.
- **`describe('withImageUploadEncoding')`** – Six cases covering: `$ref` body stamping, inline body stamping, no-op for bodies without `imageUpload`, root-key removal, three refusal inputs (absent / empty / non-string array), and refusal when no body carries an upload part.

## Relationships

- **`scripts/contracts/image-upload-encoding.ts`** – The module under test; the file imports and exercises `withImageUploadEncoding`.
- **`scripts/contracts/openapi-document.ts`** – Provides the `OpenApiDocument` type used to type the stub documents and helpers.
- **`tests/support/stub.ts`** – Supplies `asStub`, which lets the tests construct minimal typed documents without a real spec file.

## Notes

- `withImageUploadEncoding` is **destructive**: it mutates the document in place (adds `encoding`, deletes the root key). The `stamped` helper makes this explicit by calling it before returning.
- The stamped `contentType` value is the list joined with `", "` (e.g. `"image/png, image/webp"`), not a raw array.
- Refusal tests assert the error message contains `'x-image-upload-types'` (for bad root lists) or `'no multipart body'` (for documents with no eligible body) — both are the contract's guard messages.
