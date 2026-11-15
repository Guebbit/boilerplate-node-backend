---
source: src/infrastructure/config/shared-rules/images.ts
sha256: 7d4e0aaab83953cbb85fdff45e40f340d0d50bb074dff60499dc87271d7d9f67
generated_at: 2026-11-14T17:57:31.562024+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/config/shared-rules/images.ts

## Purpose

Zod schema that validates the structure of `shared/rules/images.yaml`. It defines what image formats the system accepts (identified by leading-byte signatures and MIME types), what extension each is stored under, whether the digest job can re-encode it, and the version segment used in thumbnail paths.

## Key elements

- **`imagesSchema`** (exported) — Top-level `z.strictObject`. Expects a single `images` key containing:
  - `thumbnailVersion` — string matching `/^v[0-9]+$/`; used as the version segment in every thumbnail path.
  - `formats` — non-empty array of `imageFormatSchema` entries.
  - A `.refine` guard that rejects the config if any MIME type or alias appears more than once across all formats.
- **`imageFormatSchema`** (internal) — Describes one accepted image format: `mime`, optional `aliases`, `offset`, `bytes` (signature), `extension`, optional `alsoRequires` (additional byte markers), and `reencodable`.
- **`markerSchema`** (internal) — A single offset+bytes pair used inside `alsoRequires` for multi-position signatures.

All objects are `z.strictObject`; an unexpected key is treated as a typo or a concern that belongs in code, not config.

## Relationships

- **`src/infrastructure/config/shared-rules/registry.ts`** — Consumes `imagesSchema` (alongside other shared-rule schemas) to validate and register the YAML file at load time.
- **`tests/unit/infrastructure/config/ops-rules-schemas.test.ts`** — Unit-tests the schema's accept/reject behavior, including the duplicate-MIME refinement.

## Notes

- The `thumbnailVersion` regex uses an explicit `[0-9]` class (not the `\d` shorthand) deliberately, because the pattern is mirrored into a shared JSON schema consumed by a "twin" service. An eslint-disable comment marks this.
- `aliases` is optional but, when present, must have at least one entry. The cross-format uniqueness check counts `mime` **and** all `aliases` together.
- Byte values are constrained to `0–255` via `z.int().min(0).max(255)`.
