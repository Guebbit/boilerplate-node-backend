---
source: shared/rules/images.yaml
source_sha256: 987c2599d9738f06199c06ee572ccf7338a6585ca02ccf67c156a6831873d329
context_sha256: 312fba1c1faf7ea317bb56cd4bba43364b3dcb493ebaf7a6cb8bbc54dc40ada4
generated_at: 2026-11-22T02:26:00.409388+00:00
model: claude-code:claude-sonnet-5-5
---

# shared/rules/images.yaml

## Purpose
Declares which raster image formats an upload may be, identified by their leading bytes (magic numbers) rather than the client-supplied `Content-Type`. SVG is deliberately excluded because browsers execute it as XML. It is the source of truth for upload image validation.

## Key elements
- `images.thumbnailVersion` (`v1`): a version tag for thumbnails. It is bumped, not overwritten, when thumbnail quality settings change, because thumbnail URLs are `immutable, 1y`.
- `images.formats`: the list of accepted formats. Each entry has these fields:
  - `mime`: the canonical content type.
  - `offset` / `bytes`: the byte sequence that must appear at that offset.
  - `alsoRequires`: extra offset/bytes markers that must also match.
  - `aliases`: other `Content-Type` spellings clients send.
  - `extension`: the extension the file is stored under. It is never taken from the client's filename.
  - `reencodable`: marks formats the digest job can re-encode.
- Formats defined:
  - PNG: 8-byte signature at offset 0. The trailing bytes catch transfers that mangled line endings.
  - JPEG: `ff d8 ff` at offset 0, stored as `jpg`, with alias `image/jpg`.
  - WebP: `WEBP` at offset 8, plus `RIFF` at offset 0 via `alsoRequires`.
  - All three are `reencodable: true`.

## Relationships
`shared/rules/defaults.yaml` is listed as a graph neighbor, but this file contains no reference to it, so no direct interaction is visible here.

## Notes
- Not read at boot. Per the file's header comment, `npm run regenerate` generates a TypeScript file from it, so edits take effect only after regenerating.
- WebP needs both markers because `RIFF` alone or `WEBP` alone also matches other containers.
- JPEG matches only the SOI marker plus one byte of the next marker, since the bytes that follow vary by encoder.
- `image/jpg` is not an IANA type but is accepted as an alias because enough clients send it.
