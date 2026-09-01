# src/infrastructure/adapters/image-signatures.ts

## Purpose

Identifies the real image format of an uploaded file by matching its leading bytes against known magic-byte signatures, rather than trusting the client-supplied `Content-Type`. This protects downstream consumers (static file serving, browser decoders) from mislabelled or maliciously disguised uploads. It is deliberately dependency-free: three inline signatures are easier to audit than a third-party library.

## Key elements

- **`SUPPORTED_IMAGE_FORMATS`** (internal) — Array of `ImageFormat` entries for PNG, JPEG, and WebP. Each carries the canonical MIME type, optional aliases, byte offset, signature bytes, and storage extension. The single source of truth for accepted formats.
- **`ACCEPTED_UPLOAD_MIMETYPES`** (exported `Set<string>`) — All canonical MIME types and aliases across supported formats. Used by `storage.ts` to build its allow-list.
- **`identifyImage(header: Buffer)`** (exported) — Returns the MIME type whose signature matches the given buffer, or `undefined`. Pure function over a byte header.
- **`identifyImageFile(filePath: string)`** (exported, async) — Opens a file, reads only the header bytes (`HEADER_LENGTH`), delegates to `identifyImage`. Returns `undefined` for unreadable or unrecognised files. Closes the handle in `finally`.
- **`extensionForImage(mime)`** (exported) — Maps a canonical MIME type to its storage extension. Only returns extensions from `SUPPORTED_IMAGE_FORMATS`, never the client's filename.
- **`normaliseDeclaredImageMime(declared)`** (exported) — Folds a non-IANA alias (e.g. `image/jpg`) into its canonical MIME so declared and sniffed types compare equal.
- **`CANONICAL_MIME_BY_ALIAS`** (internal `Map`) — Pre-built alias→canonical lookup derived from the format table.
- **`HEADER_LENGTH`** (internal) — `max(offset + bytes.length)` across formats; the number of bytes `identifyImageFile` reads.

## Relationships

- **`src/infrastructure/adapters/storage.ts`** — Imports `ACCEPTED_UPLOAD_MIMETYPES` to populate its upload validation allow-list. Adding a format here is the single change needed; `storage.ts` picks it up automatically.
- **`src/infrastructure/adapters/image.worker.ts`** — The upload worker that calls `identifyImageFile` / `identifyImage` to validate and store incoming images, and `extensionForImage` to choose the on-disk extension.
- **`tests/unit/infrastructure/adapters/image-signatures.test.ts`** — Unit tests covering signature matching, alias normalisation, header truncation, and the file-reading path.
- **`tests/unit/infrastructure/adapters/image.worker.test.ts`** — Tests the worker's use of these functions in the upload pipeline.

## Notes

- **SVG is intentionally excluded.** The format list is raster-only; accepting SVG would mean accepting script-bearing XML.
- **WebP offset is 8**, not 0. The `WEBP` marker sits inside a RIFF container; matching at offset 0 would also hit WAV/AVI.
- **JPEG matches only 3 bytes** (`FF D8 FF`). The next marker varies by encoder (JFIF vs. Exif vs. raw), so a longer prefix would produce false negatives.
- **`image/jpg` is not a real IANA type**, but is listed as an alias because many clients send it. `normaliseDeclaredImageMime` maps it back to `image/jpeg` before comparison.
- **`identifyImageFile` reads at most `HEADER_LENGTH` bytes** (12 in practice). It never loads the full file, so a multi-gigabyte upload cannot be used as a memory-exhaustion vector against the validator.
- **Storage extension is derived from sniffed type, never the client filename.** A valid PNG saved as `.html` would be served as `text/html` by a static server — the extension *is* the `Content-Type` in that context.
