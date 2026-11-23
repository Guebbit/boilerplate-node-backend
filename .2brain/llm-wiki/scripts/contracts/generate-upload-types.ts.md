---
source: scripts/contracts/generate-upload-types.ts
generated_at: 2026-11-22T01:57:40.036494+00:00
model: claude-code:claude-sonnet-5-5
---

# scripts/contracts/generate-upload-types.ts

## Purpose
A script that reads the bundled `openapi.yaml` and generates a TypeScript file listing the accepted image upload media types. Every multipart `imageUpload` part declares `encoding.imageUpload.contentType` (stamped by the bundler from the root's `x-image-upload-types`). The backend's `fileFilter` and the frontend's file picker both consume the result, so the contract is the single place the list is written.

## Key elements
- **`INPUT`**: `openapi.yaml` resolved against `REPO_ROOT`.
- **`OUTPUT`**: absolute path from the required `--out` argument.
- **`document`**: the YAML parsed with `yaml`'s `parse`, typed by the minimal `OpenApiDocument` / `MediaType` interfaces (only the paths → verbs → `requestBody.content` → `encoding.imageUpload.contentType` slice).
- **`declared`**: a `Map` from each distinct `contentType` to the `METHOD route` operations that declare it. Only `multipart/form-data` bodies are inspected.
- **Validation**: exits with code 1 if no operation declares a content type, or if more than one distinct value is found. The disagreement message lists each value with its operations.
- **`types`**: the single accepted string split on `,` and trimmed.
- **`output`**: the generated file text. It carries a "DO NOT EDIT" header and exports `ACCEPTED_UPLOAD_TYPES` (a `const` array) and the `AcceptedUploadType` union type.
- Finally calls `writeOrCheck(OUTPUT, output, 'openapi.yaml')`.

## Relationships
- `./generated-file`: provides `writeOrCheck`, which writes the file or, under `--check`, compares it with what is on disk and exits 1 on a mismatch.
- `../cli`: provides `requiredPath`, used to resolve the `--out` argument.
- `../modules-on-disk`: provides `REPO_ROOT`, used to locate `openapi.yaml` and to resolve `--out`.

## Notes
- Usage: `tsx scripts/contracts/generate-upload-types.ts --out <path> [--check]`. The generated header names `npm run gen:api` as the regeneration command.
- The script runs at module top level with no exported functions. Importing it executes it.
- The whole API shares one list. Differing upload bodies are an error rather than being merged.
- The output is written beside the backend's other generated contract files under `api.generated/`. The frontend keeps its own copy of this script, which writes under its `contracts/` folder.
