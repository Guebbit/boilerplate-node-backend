---
source: shared/rules/images.yaml
sha256: 987c2599d9738f06199c06ee572ccf7338a6585ca02ccf67c156a6831873d329
generated_at: 2026-11-08T03:09:21.892019+00:00
model: ollama:qwen3.8:27b
---

# shared/rules/images.yaml

## Purpose

Declarative source of truth for which raster image formats the upload pipeline accepts and how to detect them by magic bytes. It is **not** read at runtime; `npm run regenerate` compiles it into `src/infrastructure/adapters/images.generated.ts`. The file also tracks the thumbnail version string so that a quality-setting change can bump the cache-busting segment in immutable (`1y`) thumbnail URLs.

## Key elements

- **`thumbnailVersion`** (`v1`) — opaque version tag embedded in thumbnail URLs; bump (don't edit in place) whenever thumbnail encoding settings change.
- **`formats[]`** — array of format descriptors:
  - `mime` — canonical MIME type.
  - `aliases` (optional) — non-IANA or legacy `Content-Type` spellings clients actually send (e.g. `image/jpg`).
  - `offset` / `bytes` — the magic-byte signature and its position in the stream.
  - `alsoRequires` (optional) — additional byte signatures that must *also* match (WebP: `RIFF` at 0 + `WEBP` at 8) to disambiguate from other RIFF containers.
  - `extension` — the storage extension assigned server-side; the client's filename is never used.
  - `reencodable` — whether the digest job may re-encode the image.
- **Defined formats:** PNG, JPEG (with `image/jpg` alias), WebP. All three are `reencodable: true`.

## Relationships

- **`shared/contracts/openapi.root.yaml`** — The `mime` / `aliases` values here are the `Content-Type` values the OpenAPI contract exposes for upload endpoints. Changing a MIME type or adding an alias in this file should be accompanied by a matching update to the schema so the two stay consistent.

## Notes

- **SVG is intentionally excluded** — the file header calls out that SVG is XML that browsers execute, so it is not a permitted upload format.
- **PNG magic bytes include the line-ending bytes** (`\r\n\x1a\n`) to catch uploads where line endings were mangled in transit.
- **JPEG detection uses only 3 bytes** (`FF D8 FF`) because the byte following SOI varies by encoder.
- **WebP requires two checks** (`alsoRequires`) because `WEBP` at offset 8 alone also appears in other RIFF sub-formats.
- The generated file path (`src/infrastructure/adapters/images.generated.ts`) is the actual runtime artifact; edit *this* YAML and re-run `npm run regenerate` rather than hand-editing the generated TS.
