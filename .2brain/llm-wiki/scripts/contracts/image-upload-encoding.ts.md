---
source: scripts/contracts/image-upload-encoding.ts
sha256: 36624a283a053622a3eda52c05f1031c30a91741bce061802657a2ebb5a4cb82
generated_at: 2026-11-08T02:42:45.149376+00:00
model: ollama:qwen3.8:27b
---

# scripts/contracts/image-upload-encoding.ts

## Purpose

Stamps a single `encoding.imageUpload.contentType` value onto every multipart request body in the OpenAPI document that declares an `imageUpload` schema property. The accepted MIME types are declared once at the document root (`x-image-upload-types`) and then distributed, eliminating hand-copied strings that can drift. Runs as a pipeline step during bundle assembly.

## Key elements

- **`IMAGE_PART`** – Constant (`'imageUpload'`) identifying the multipart part name.
- **`isTypeList`** – Type guard that narrows an unknown value to a non-empty `string[]`.
- **`withImageUploadEncoding: Step`** – The exported pipeline step. Reads `x-image-upload-types` from the root, joins the list into a comma-separated `contentType` string (OAS 3.1 style), finds every `multipart/form-data` media object whose schema contains the `imageUpload` property (resolving `$ref` through `components.schemas`), and writes `media.encoding.imageUpload.contentType`. Deletes the root key afterwards since it is an internal instruction, not part of the published contract.

## Relationships

- **`./openapi-document`** – Imports `operationsOf` (iterates operations) and the `Step` type.
- **`./openapi-bundle`** – Consumes `withImageUploadEncoding` as one step in the bundle pipeline.
- **`tests/unit/scripts/contracts/image-upload-encoding.test.ts`** – Unit tests for this module.

## Notes

- Throws if the root key is missing/invalid **or** if no body in the document carries an `imageUpload` part—both conditions are treated as contract errors.
- The root `x-image-upload-types` key is deleted after stamping; it must not appear in the final published document.
- Schema resolution follows a single level of `$ref` into `components.schemas`; nested or remote refs are not traversed.
- The byte-signature verification for uploaded images is intentionally **not** in this file; it lives in `shared/rules/images.yaml` (server internals).
