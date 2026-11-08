---
source: tests/contract/upload-types.test.ts
sha256: 8b864328ba10871f5a067234aeb9bc8633b6a0983ff26e9f3284c4241b3e1740
generated_at: 2026-11-08T09:21:53.899845+00:00
model: ollama:qwen3.8:27b
---

# tests/contract/upload-types.test.ts

## Purpose

Contract test that guards the single source of truth for accepted image upload types. It verifies that every multipart operation in the published OpenAPI spec declares the exact same `imageUpload` content-type list as the runtime constant `ACCEPTED_UPLOAD_TYPES`, preventing drift between the documented contract and the code that enforces it.

## Key elements

- **`Spec` (interface)** – A narrow, typed slice of the OpenAPI document covering only `paths → requestBody → content → encoding`. Avoids pulling in the full spec type.
- **`uploadEncodings()`** – Reads `../../openapi.yaml`, flattens all path/method pairs, and returns a `[operationLabel, imageUploadContentType?]` tuple for every multipart body that declares an `imageUpload` encoding.
- **`it.each(uploadEncodings())`** – Parametrized test: for each declared operation, asserts the spec's comma-separated content types (trimmed) equal `[...ACCEPTED_UPLOAD_TYPES]` in order.
- **`it('lists canonical types only')`** – Asserts `ACCEPTED_UPLOAD_TYPES` is exactly `['image/png', 'image/jpeg', 'image/webp']`, pinning the canonical set.

## Relationships

No graph neighbors are tracked. The file's only cross-module import is `ACCEPTED_UPLOAD_TYPES` from `@api/upload-types`; it also reads the project-root `openapi.yaml` at runtime via a relative `__dirname` path.

## Notes

- The spec path is resolved relative to the test file (`../../openapi.yaml`), not to `process.cwd()`, so the test works regardless of where Jest is invoked from.
- Only the `imageUpload` encoding part is checked; other multipart parts (e.g., a file field with a different name) are ignored.
- Order matters: the first test compares arrays with `toEqual`, so the spec must list types in the same order as the generated constant.
- If a new upload type is added to `@api/upload-types`, the corresponding `openapi.yaml` `encoding.imageUpload.contentType` must be updated in lockstep or this test fails.
