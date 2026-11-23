---
source: shared/rules/schemas/images.generated.schema.json
source_sha256: 9ca02f7b56f458c76d9947f4e77861695bb4ead475a65aaf2ee03cbb5604d99d
context_sha256: 1db6f1e92515af6467e76d17917651897685b578d8c480dda6db78731674b2a0
generated_at: 2026-11-22T02:27:41.535079+00:00
model: claude-code:claude-sonnet-5-5
---

# shared/rules/schemas/images.generated.schema.json

## Purpose
A generated JSON Schema (draft 2020-12) that validates the shape of an image-rules configuration object. It describes supported image formats, how to detect them from file bytes (magic numbers), and a thumbnail version tag. The filename indicates it is produced by tooling rather than edited by hand.

## Key elements
- **`images`** (required, only top-level key): object with no extra properties allowed.
  - **`thumbnailVersion`** (required): string matching `^v[0-9]+$` (the letter `v` followed by digits).
  - **`formats`** (required): non-empty array of format entries. Each entry has:
    - `mime` (required): string matching `^image\/[a-z0-9.+-]+$`.
    - `aliases`: optional non-empty array of additional MIME strings, same pattern.
    - `offset` (required): integer from 0 to 9007199254740991 (max safe integer). It is the byte position where the signature is checked.
    - `bytes` (required): non-empty array of integers 0–255, the signature bytes.
    - `extension` (required): lowercase alphanumeric string (`^[a-z0-9]+$`).
    - `alsoRequires`: optional non-empty array of extra `{offset, bytes}` checks, both fields required, with the same constraints as above.
    - `reencodable` (required): boolean.

## Relationships
No graph neighbors are listed. The schema is standalone. Other files presumably supply or consume data conforming to it, but nothing in this file shows that.

## Notes
- `additionalProperties: false` is set at every object level, so unknown keys fail validation.
- `alsoRequires` allows multi-part signatures. An example is a format whose identity needs matching bytes at a second offset. This is inferred from the field's shape, and no data is included here.
- The schema checks structure and ranges only. It does not enforce that `aliases` differ from `mime`, that `extension` values are unique, or that `bytes` fit within a file.
- Do not edit by hand. Changes should be made in whatever source generates it, which is not identified in this file.
