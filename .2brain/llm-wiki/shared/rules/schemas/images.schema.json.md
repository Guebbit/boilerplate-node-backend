---
source: shared/rules/schemas/images.schema.json
sha256: 9ca02f7b56f458c76d9947f4e77861695bb4ead475a65aaf2ee03cbb5604d99d
generated_at: 2026-10-29T01:48:21.552231+00:00
model: ollama:qwen3.8:27b
---

# shared/rules/schemas/images.schema.json

## Purpose

JSON Schema (draft 2020-12) that validates a configuration object describing supported image formats and their binary detection rules (magic bytes, MIME types, extensions, re-encodability). It exists to ensure any image-format definition consumed by the system conforms to a strict, self-describing contract before use.

## Key elements

- **`images`** — top-level required key wrapping all format configuration.
- **`images.thumbnailVersion`** — required string matching `^v[0-9]+$` (e.g. `"v1"`); identifies the schema/generation of thumbnail rules.
- **`images.formats`** — required array (≥ 1 item) of format descriptors. Each descriptor:
  - `mime` — canonical MIME type (`image/…`).
  - `aliases` — optional extra MIME strings accepted as equivalents.
  - `offset` + `bytes` — magic-byte signature (byte offset + expected byte values 0–255) used for binary format detection.
  - `extension` — lowercase alphanumeric file extension (e.g. `"png"`).
  - `alsoRequires` — optional array of additional `{offset, bytes}` checks that must *all* match (for multi-signature formats).
  - `reencodable` — boolean flag indicating whether the format can be re-encoded.
  - `additionalProperties: false` on every object level; no extra keys permitted.

## Relationships

No graph neighbors recorded.

## Notes

- All `bytes` values are constrained to 0–255 (single-byte range); multi-byte sequences are expressed as multiple array entries, not a single number.
- `offset` allows values up to `9007199254740991` (`Number.MAX_SAFE_INTEGER`), so offsets are not limited to the first few bytes of a file.
- `alsoRequires` items are stricter than the top-level format object: both `offset` and `bytes` are required, and `additionalProperties` is disallowed.
- Because `additionalProperties: false` is set at every nesting level, adding any new field requires updating this schema first.
- `mime` and `aliases` share the same regex (`^image\/[a-z0-9.+-]+$`); any value in `aliases` must also be a valid `image/*` MIME string.
