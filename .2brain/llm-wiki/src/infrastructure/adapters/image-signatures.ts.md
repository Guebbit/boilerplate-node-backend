---
source: src/infrastructure/adapters/image-signatures.ts
sha256: c827244acc6da2a566afa79792136cfacc7a1bece35afdfa321b948b0100d84c
generated_at: 2026-10-14T07:44:08.072286+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/adapters/image-signatures.ts

## Purpose

Identifies uploaded images by their leading bytes (magic-number signatures) rather than trusting the client-supplied `Content-Type` header. It exists because a spoofable header would let an attacker store a script or executable under an image extension, and the project deliberately avoids a third-party sniffing dependency (`file-type`) so the three accepted signatures remain auditable inline.

## Key elements

- **`SUPPORTED_IMAGE_FORMATS`** (internal) — The single source of truth for accepted formats. Each entry (`ImageFormat`) carries the canonical MIME, client aliases, byte offset, signature bytes, optional secondary markers (`alsoRequires`), and the storage extension. Currently: PNG, JPEG, WebP. No SVG.
- **`ACCEPTED_UPLOAD_MIMETYPES`** (exported, `Set<string>`) — Every MIME spelling (canonical + aliases) across all supported formats. Consumed by the upload middleware to validate `Content-Type` before sniffing.
- **`identifyImage(header: Buffer): string | undefined`** (exported) — Synchronous magic-byte check against a buffer; returns the canonical MIME or `undefined`.
- **`identifyImageFile(filePath: string): Promise<string | undefined>`** (exported) — Reads only the header-length prefix from a file on disk, delegates to `identifyImage`. Returns `undefined` for unreadable paths or non-matching bytes.
- **`extensionForImage(mime: string | undefined): string | undefined`** (exported) — Maps a canonical MIME back to the storage extension. Rejects anything not in `SUPPORTED_IMAGE_FORMATS`.
- **`normaliseDeclaredImageMime(declared: string | undefined): string | undefined`** (exported) — Folds non-IANA aliases (e.g. `image/jpg`) to their canonical MIME so declared and sniffed types are comparable.
- **`hasMarker`** (internal) — Checks whether a buffer contains a given byte sequence at a given offset.
- **`HEADER_LENGTH`** (internal) — Computed as the maximum `offset + bytes.length` across all markers, ensuring one read covers the longest signature.

## Relationships

- **`src/infrastructure/http/middlewares/upload.ts`** — Imports `ACCEPTED_UPLOAD_MIMETYPES` to gate incoming multipart parts by declared MIME before the file hits disk.
- **`src/infrastructure/adapters/image.worker.ts`** — Calls `identifyImageFile` (and likely `extensionForImage`) to determine the actual format of a stored upload and choose the correct extension.
- **`tests/unit/infrastructure/adapters/image-signatures.test.ts`** — Unit-tests the public exports with crafted byte buffers.
- **`tests/unit/infrastructure/adapters/image.worker.test.ts`** — Exercises the worker path that depends on this module's identification functions.

## Notes

- Only **raster** formats are accepted; SVG is explicitly excluded because it is executable XML.
- JPEG matching is intentionally limited to three bytes (`FF D8 FF`) — the fourth byte varies by encoder (JFIF, Exif, raw).
- WebP requires **two** markers: `RIFF` at offset 0 *and* `WEBP` at offset 8, to avoid false-matching WAV/AVI.
- The PNG signature includes all 8 bytes (through the `\x0a` line-ending guard), not just the first 4.
- `identifyImageFile` deliberately does not load the full file into memory; it reads only `HEADER_LENGTH` bytes.
- `CANONICAL_MIME_BY_ALIAS` and `ACCEPTED_UPLOAD_MIMETYPES` are both derived from `SUPPORTED_IMAGE_FORMATS` at module load; adding a new format means adding one entry to that array.
