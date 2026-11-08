---
source: scripts/contracts/generate-upload-types.ts
sha256: ffd171c4ab69390009b9fce7f6e5da75d3b6a1fe32b5084377f38d9e5691e69e
generated_at: 2026-11-08T02:42:30.782604+00:00
model: ollama:qwen3.8:27b
---

# scripts/contracts/generate-upload-types.ts

## Purpose

Reads the bundled `openapi.yaml` contract, extracts the single `imageUpload` contentType shared across all multipart upload bodies, and emits a small TypeScript file exporting `ACCEPTED_UPLOAD_TYPES` (a `const` tuple) and `AcceptedUploadType` (a union type). This makes the OpenAPI contract the single source of truth for which media types the backend's `fileFilter` and the frontend's file picker accept.

## Key elements

- **`MediaType` / `OpenApiDocument` interfaces** — minimal structural types that narrow the parsed YAML to the two fields this script reads (`encoding.imageUpload.contentType` under `multipart/form-data`).
- **Validation loop** — walks every `paths[*][*].requestBody.content['multipart/form-data'].encoding.imageUpload.contentType`, collecting distinct values into a `Map<string, string[]>` keyed by the type string.
- **Single-list invariant** — if the map has 0 entries (no upload declared) or >1 distinct contentTypes (bodies disagree), prints a diagnostic and `process.exit(1)`.
- **Output generation** — splits the comma-separated type string into an array, then builds a file containing a generated-file banner, the `as const` array, and the indexed-access union type.
- **`writeOrCheck(OUTPUT, output, 'openapi.yaml')`** — writes the result, or (with `--check`) diffs against disk and exits 1 on mismatch.

## Relationships

- **`scripts/contracts/generated-file.ts`** — supplies `writeOrCheck`, the shared helper that handles `--out`/`--check` semantics for all generated contract files.
- **`scripts/cli.ts`** — supplies `requiredPath`, which reads the required `--out` CLI argument (resolved against the repo root) and exits with a usage error if absent.

## Notes

- Runs as **ESM** via the `#!/usr/bin/env tsx` shebang; paths are derived from `import.meta.url`, not `__dirname`.
- The `contentTypes` value in the YAML is a **comma-separated string** (e.g. `"image/png,image/jpeg"`); the script splits and trims it into the tuple.
- The frontend repo keeps its **own copy** of this script, writing under its `contracts/` folder rather than `api/`.
- Intended invocation: `tsx scripts/contracts/generate-upload-types.ts --out <path> [--check]`; typically wired to `npm run gen:api`.
