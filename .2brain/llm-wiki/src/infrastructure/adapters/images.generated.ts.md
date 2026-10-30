---
source: src/infrastructure/adapters/images.generated.ts
sha256: fbdf7cff00f75a0a2e7a90e1b48f6a58193e5de7af7a61c3a89a9bcb251b8903
generated_at: 2026-10-29T01:55:19.056886+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/adapters/images.generated.ts

## Purpose

Generated data file that defines the accepted image formats (PNG, JPEG, WebP) and their byte-signature rules, plus the current thumbnail version. It exists so that image validation logic and thumbnail handling have a single, declarative source of truth that is produced from a YAML rule file rather than hand-maintained in TypeScript.

## Key elements

- **`imageRuleData`** (exported `const`, typed `as const`) — the sole export. Contains:
  - `thumbnailVersion: 'v1'` — the active thumbnail processing version.
  - `formats[]` — one entry per accepted format, each with:
    - `mime` / optional `aliases` — MIME type(s) the format maps to.
    - `offset` — byte offset at which the signature is read.
    - `bytes[]` — the exact byte sequence that identifies the format.
    - `extension` — canonical file extension.
    - `reencodable` — whether the format can be re-encoded (all three are `true`).
    - `alsoRequires[]` *(WebP only)* — additional offset/byte checks (RIFF magic at offset 0) that must also match.

## Relationships

- **`image-signatures.ts`** — consumes `imageRuleData.formats` to perform byte-level signature validation of uploaded files.
- **`image.ts`** / **`image.worker.ts`** — reference `imageRuleData` for format decisions (e.g., which formats are reencodable) and thumbnail version selection.
- **`image-store.ts`** — uses the extension and MIME metadata to name and categorise stored image assets.

## Notes

- **Do not edit by hand.** The file is regenerated from `shared/rules/images.yaml` via `npm run regenerate`. To change accepted formats, byte signatures, aliases, or the thumbnail version, edit the YAML and re-run the generator.
- The `alsoRequires` array on WebP reflects that WebP is a container format: the RIFF magic must be present at offset 0 *and* the `WEBP` marker at offset 8. Validation logic must check both.
- JPEG carries an `aliases` field (`image/jpg`) — code that matches MIME strings must check both the primary `mime` and any `aliases` entries.
