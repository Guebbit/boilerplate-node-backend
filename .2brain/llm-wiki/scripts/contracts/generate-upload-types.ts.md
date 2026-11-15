---
source: scripts/contracts/generate-upload-types.ts
sha256: 435c677e7bbfae02f3e96f35a3c50710b3fc5e55b8f026e9dbd97a6bc8b5042b
generated_at: 2026-11-14T17:26:37.222660+00:00
model: ollama:qwen3.8:27b
---

# scripts/contracts/generate-upload-types.ts

## Purpose

Extracts the single accepted upload media-type list from the bundled `openapi.yaml` (the `encoding.imageUpload.contentType` field on every multipart request body) and emits a small TypeScript module exporting a frozen array and a union type. It exists so the backend's `fileFilter` and the frontend's file picker share one canonical source for "what can be uploaded," with a `--check` mode for CI drift detection.

## Key elements

- **`MediaType` / `OpenApiDocument`** — Narrow structural interfaces describing the only slice of the parsed YAML this script reads (request body → multipart → encoding → imageUpload → contentType).
- **`declared` (Map)** — Accumulates each distinct `contentType` string alongside the `METHOD route` operations that declare it; the script then asserts exactly one key exists.
- **`types`** — The single comma-separated `contentType` value, split and trimmed into an array.
- **`output`** — The full generated file text: a `const ACCEPTED_UPLOAD_TYPES` (typed as `readonly string[]`) and a derived `AcceptedUploadType` union type, preceded by a "DO NOT EDIT" banner.
- **`writeOrCheck(OUTPUT, output, 'openapi.yaml')`** — Persists the file or, under `--check`, exits 1 if the on-disk copy differs.

## Relationships

- **`scripts/cli.ts`** — Imports `requiredPath` to resolve the `--out` CLI argument relative to the repo root.
- **`scripts/contracts/generated-file.ts`** — Imports `writeOrCheck`, the shared helper that either writes the generated file or diffs it against the existing one (`--check`).
- **`scripts/modules-on-disk.ts`** — Imports `REPO_ROOT` to locate `openapi.yaml` at the repository root.

## Notes

- The script hard-fails (`process.exit(1)`) if **zero** operations declare the field or if **more than one** distinct `contentType` value appears across the document. There is no "merge" or "first-wins" path.
- The `contentType` value is expected to be a comma-separated list (e.g. `"image/png, image/jpeg"`); the script splits on commas and trims. It does **not** validate individual MIME strings.
- The frontend keeps its own copy of this script (writing under its `contracts/` folder); this copy writes under `api/`. The logic is identical, so the two generated files must stay in sync manually or by convention.
- `REPO_ROOT` is resolved at import time; the script assumes `openapi.yaml` sits directly at that root.
