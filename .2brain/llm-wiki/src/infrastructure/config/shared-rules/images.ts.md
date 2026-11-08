---
source: src/infrastructure/config/shared-rules/images.ts
sha256: 082110545161fdb4df8b9d68fb55c1bfc1a73873d35463bd484cd7dfcea22afe
generated_at: 2026-11-08T03:26:28.898583+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/config/shared-rules/images.ts

## Purpose

Zod validation schema for `shared/rules/images.yaml`. It defines the shape of the image-format rules file: which MIME types are accepted, their magic-byte signatures, storage extensions, re-encodability flags, and the version segment used in thumbnail paths. The schema enforces strict objects and cross-format uniqueness so that a typo'd key or a duplicate MIME entry is caught at load time.

## Key elements

- **`markerSchema`** (internal) — `{ offset, bytes }` describing a single magic-byte check at a given offset. Used as the element type of `alsoRequires`.
- **`imageFormatSchema`** (exported) — Strict object for one accepted image format: `mime`, optional `aliases`, `offset`, `bytes`, `extension`, optional `alsoRequires`, and `reencodable`. All objects are `z.strictObject`; an unexpected key fails validation.
- **`imagesSchema`** (exported) — Top-level schema for the YAML file. Requires an `images` block with a `thumbnailVersion` (matches `/^v\d+$/`) and a non-empty `formats` array. A `.refine` step rejects the file if any MIME type or alias appears more than once across all formats.

## Relationships

- **`src/infrastructure/config/shared-rules/registry.ts`** — Imports `imagesSchema` to register it in the shared-rules registry, making the schema available to the YAML loader (`load.ts`) and any consumer that needs to validate the rules file.
- **`tests/unit/infrastructure/config/ops-rules-schemas.test.ts`** — Unit-tests both exported schemas: valid/invalid shape, strict-object rejection, and the duplicate-MIME refine rule.

## Notes

- All objects are `z.strictObject`. An extra key in the YAML is treated as a bug (typo or logic that belongs in code) and will fail validation—add the key to the schema intentionally if it is new.
- `aliases` is optional on each format but, when present, must contain at least one entry. The refine constraint treats `aliases` entries as part of the same uniqueness namespace as `mime`, so an alias duplicating another format's `mime` (or vice-versa) is rejected.
- `bytes` values are constrained to `0–255` (single byte). Multi-byte signatures are expressed as an array, not a hex string.
- The file uses only relative imports (per the module doc-comment pointing at `load.ts` for the convention).
