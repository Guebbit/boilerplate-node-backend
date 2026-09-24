---
source: src/infrastructure/adapters/image-signatures.ts
sha256: e733d3ec6b416ed69c40ae765eefa2e318acfd1be393520723427b70ad0ff123
generated_at: 2026-09-23T17:39:08.686844+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/adapters/image-signatures.ts

## Purpose

Identifies the actual image format of an upload by matching its leading bytes against known signatures, rather than trusting the client-supplied `Content-Type` header. This exists because the MIME type is determined after upload (for storage naming, security review, and correct serving), and a spoofed or misspelled header must not dictate what the system believes the file is.

## Key elements

- **`ImageFormat`** (interface) — Describes one accepted format: canonical MIME, optional aliases, byte offset, signature bytes, and storage extension.
- **`SUPPORTED_IMAGE_FORMATS`** — The three accepted raster formats (PNG, JPEG, WebP) with their exact byte signatures. SVG is deliberately excluded (XSS risk).
- **`ACCEPTED_UPLOAD_MIMETYPES`** (exported `Set`) — Every MIME spelling (canonical + aliases) a client may declare. Single source of truth for "what does this API accept."
- **`identifyImage(header: Buffer)`** (exported) — Returns the MIME type whose signature matches the buffer's leading bytes, or `undefined`.
- **`identifyImageFile(filePath: string)`** (exported) — Reads only the header from disk (bounded by `HEADER_LENGTH`) and delegates to `identifyImage`. Returns `undefined` on any read failure.
- **`extensionForImage(mime)`** (exported) — Maps a canonical MIME type back to its storage extension. Returns `undefined` for unrecognised types.
- **`normaliseDeclaredImageMime(declared)`** (exported) — Folds non-IANA aliases (e.g. `image/jpg`) into their canonical form so declared and sniffed types compare as equals.

## Relationships

- **`src/infrastructure/http/middlewares/upload.ts`** — Imports `ACCEPTED_UPLOAD_MIMETYPES` to validate inbound `Content-Type` headers before the file is written. Adding a format here requires no change in that middleware.
- **`src/infrastructure/adapters/image.worker.ts`** — Consumes `identifyImageFile` (or `identifyImage`) in the worker process to sniff uploaded files and produce the canonical type for downstream storage.
- **`tests/unit/infrastructure/adapters/image-signatures.test.ts`** — Unit-tests the signature matching, alias normalisation, and edge cases (short buffers, unrecognised bytes).
- **`tests/unit/infrastructure/adapters/image.worker.test.ts`** — Exercises the worker path, which calls into this module's identification functions.

## Notes

- The PNG signature includes all 8 bytes (`\x89PNG\r\n\x1a\n`) specifically to catch line-ending corruption in transit; matching only the first 4 would be less safe.
- JPEG matching is limited to 3 bytes (`FF D8 FF`) because what follows the SOI marker varies by encoder (JFIF, Exif, raw).
- WebP's `"WEBP"` tag sits at offset 8 inside a RIFF container; matching at offset 0 would also accept WAV/AVI.
- `identifyImageFile` allocates a fixed-size buffer (`HEADER_LENGTH`) and reads at most that many bytes — it never loads the full file into memory.
- The `finally` block in `identifyImageFile` guards against the `handle` being `undefined` when `open` itself throws; the eslint-disable comment documents this intent.
- Extension is derived exclusively from the sniffed type, never from the client's `originalname`, to prevent stored-XSS via a misleading file extension on a static server.
