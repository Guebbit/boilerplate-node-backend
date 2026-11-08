---
source: shared/rules/schemas/images.schema.json
sha256: 9ca02f7b56f458c76d9947f4e77861695bb4ead475a65aaf2ee03cbb5604d99d
generated_at: 2026-11-08T03:10:45.222403+00:00
model: ollama:qwen3.8:27b
---

# shared/rules/schemas/images.schema.json

## Purpose

JSON Schema (draft 2020-12) that validates a configuration object describing image format rules—thumbnail versioning, per-format magic-byte signatures, MIME types, and re-encodability flags. It enforces strict structure (`additionalProperties: false` at every level) so that only known, well-formed image-rule documents pass validation.

## Key elements

- **`images`** (required, object) — sole top-level property; contains `thumbnailVersion` and `formats`.
- **`images.thumbnailVersion`** (required) — string, pattern `^v[0-9]+$` (e.g. `"v2"`); identifies the schema/configuration generation.
- **`images.formats`** (required, array, min 1 item) — list of format descriptors. Each item:
  - `mime` (required) — canonical MIME type, pattern `^image\/[a-z0-9.+-]+$`.
  - `aliases` (optional) — array of alternative MIME types (same pattern), min 1.
  - `offset` (required) — integer (0 … 2³²−1), byte offset where the magic signature begins.
  - `bytes` (required) — array of integers 0–255, min 1; the magic-byte sequence at `offset`.
  - `extension` (required) — lowercase alphanumeric file extension, pattern `^[a-z0-9]+$`.
  - `reencodable` (required) — boolean; whether the format can be re-encoded.
  - `alsoRequires` (optional) — array of additional `{ offset, bytes }` pairs that must *all* match; each pair requires both fields.
- **`$schema`** — pins the validator to JSON Schema draft 2020-12.

## Notes

- Every object node sets `additionalProperties: false`, so unknown keys at *any* nesting level cause a validation failure—there is no room for undocumented fields.
- `bytes` values are constrained to 0–255 (single-byte magic signatures); multi-byte signatures are expressed as multiple array elements, not larger integers.
- `offset` upper bound is `9007199254740991` (Number.MAX_SAFE_INTEGER), not a fixed cap like 4 GiB.
- The schema is purely declarative—it defines shape and constraints only; no default values, examples, or `description` strings are present.
- No `$id` or URI anchor is declared, so the schema is identified by file path rather than a resolvable URL.
