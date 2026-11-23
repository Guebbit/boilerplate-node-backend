---
source: scripts/contracts/image-upload-encoding.ts
source_sha256: 5da2c64a395adbc7276aabaa50cb50aec7b56c6dc89d7eb554f20a6b4c13eca1
context_sha256: 223d0d07fe386f338028a5403f0540ab3706ee45fd544534c12a57acd56d8b08
generated_at: 2026-11-22T01:57:52.331310+00:00
model: claude-code:claude-sonnet-5-5
---

# scripts/contracts/image-upload-encoding.ts

## Purpose
A bundling step that reads a single root-level list of accepted image upload types (`x-image-upload-types`) and stamps it as `encoding.imageUpload.contentType` onto every `multipart/form-data` request body that has an `imageUpload` part. This keeps the accepted types, which are API surface clients must know, declared once instead of hand-copied across request bodies. The byte-signature verification stays server-side in `shared/rules/images.yaml`.

## Key elements
- `withImageUploadEncoding` (exported `Step`): the only export. It does the following:
  - Reads `x-image-upload-types` from the root and throws if it is not a non-empty array of non-empty strings.
  - Joins the types with `", "` into one `contentType` string, which is how OAS 3.1 expresses several accepted types.
  - Iterates `operationsOf(document_)`, finds each operation's `multipart/form-data` body, and resolves its schema. A `$ref` into `#/components/schemas/` is followed.
  - If the schema has an `imageUpload` property, sets `media.encoding = { ...media.encoding, imageUpload: { contentType } }`. Existing encoding entries for other parts are preserved.
  - Throws if no body was stamped.
  - Deletes `x-image-upload-types` from the root once done.
- `IMAGE_PART` (`'imageUpload'`): the multipart part name that is matched.
- `isTypeList`: type guard for the root list.

## Relationships
- `./openapi-document` supplies the `Step` type and the `operationsOf` iterator that this step uses.
- `./openapi-bundle` runs this step on the bundled document as part of its pipeline.
- `tests/unit/scripts/contracts/image-upload-encoding.test.ts` is the unit test for this step.

## Notes
- The step fails loudly in two cases: the root list is missing or invalid, and no multipart body has an `imageUpload` part.
- `x-image-upload-types` is removed from the output. It is an instruction to the script and is not published in the contract.
- Only `$ref`s starting with `#/components/schemas/` are resolved, by plain string replacement. Schemas are only inspected for a direct `properties` map, so `imageUpload` declared elsewhere (e.g. inside `allOf`) would not be detected.
- Only `multipart/form-data` content is examined.
