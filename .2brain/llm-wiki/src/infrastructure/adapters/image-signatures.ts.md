---
source: src/infrastructure/adapters/image-signatures.ts
sha256: d6434d2171f163c1f7ce9ba66190bc53c00789e97953e32164166451b0ef6a8a
generated_at: 2026-10-29T01:54:09.176121+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/adapters/image-signatures.ts

## Purpose

Content-based image type identification. Because a client-supplied `Content-Type` header is trivially spoofable, this module determines an image's real format from its leading bytes (magic-number signatures) instead. It exists so that downstream consumers—static file servers, decoders, SVG script vectors—never act on a label the uploader chose. It deliberately inlines three format signatures rather than pulling in `file-type` or similar, keeping the trust surface to a single auditable table.

## Key elements

- **`SUPPORTED_IMAGE_FORMATS`** (module-private) — the canonical list of accepted raster formats, sourced from `imageRuleData.formats` in `images.generated.ts`. Each entry carries MIME, aliases, byte offset, signature bytes, extension, and optional secondary markers.
- **`ACCEPTED_UPLOAD_MIMETYPES`** (exported `Set<string>`) — every MIME spelling (canonical + aliases) across all supported formats. Used by the upload middleware to whitelist declared types.
- **`identifyImage(header: Buffer): string | undefined`** — matches a buffer's leading bytes against the format table (including `alsoRequires` markers) and returns the canonical MIME or `undefined`.
- **`identifyImageFile(filePath: string): Promise<string | undefined>`** — opens the file, reads only the first `HEADER_LENGTH` bytes, delegates to `identifyImage`, and closes the handle. Returns `undefined` for unreadable or unrecognised files.
- **`extensionForImage(mime): string | undefined`** — maps a canonical MIME back to the storage extension defined in the format table. Ensures the on-disk extension can only ever be one of the accepted set.
- **`normaliseDeclaredImageMime(declared): string | undefined`** — folds a client-declared alias (e.g. `image/jpg`) into its canonical MIME so declared and sniffed types compare equal.
- **`hasMarker`** (module-private) — low-level byte-comparison helper used by `identifyImage`.
- **`HEADER_LENGTH`** (module-private) — computed as the max of all signature end-offsets, used to size the read buffer.

## Relationships

- **`src/infrastructure/adapters/images.generated.ts`** — provides `imageRuleData.formats`, the data source for `SUPPORTED_IMAGE_FORMATS`. Generated from `shared/rules/images.yaml`.
- **`src/infrastructure/http/middlewares/upload.ts`** — imports `ACCEPTED_UPLOAD_MIMETYPES` to validate declared `Content-Type` headers before the file is persisted.
- **`src/infrastructure/adapters/image.worker.ts`** — consumes `identifyImageFile` (and/or `extensionForImage`) to sniff and store uploaded images off the request thread.
- **`scripts/contracts/asyncapi-bundles.ts`** — references the accepted MIME list when generating the AsyncAPI contract, keeping the public spec in sync with the format table.
- **`tests/unit/infrastructure/adapters/image-signatures.test.ts`** — unit tests for the identification and normalisation functions.
- **`tests/unit/infrastructure/adapters/image.worker.test.ts`** — exercises the worker path that calls into this module.

## Notes

- **No SVG by design.** SVG is XML that browsers execute; accepting it would mean accepting script upload. The format table intentionally excludes it.
- **`alsoRequires` handles multi-marker signatures.** WebP, for example, needs `RIFF` at offset 0 *and* `WEBP` at offset 8. The `hasMarker` helper is called for each marker independently.
- **`identifyImageFile` reads only the header.** It never loads the full file into memory, avoiding a DoS vector where an attacker uploads a large file just to make the validator allocate a large buffer.
- **Adding a format is a single edit** to the source YAML (`shared/rules/images.yaml`) → regenerated `images.generated.ts`. The MIME set, alias map, header length, and extension map all derive from that one table.
- **`extensionForImage` ignores the client's filename.** The stored extension is always the table's value, preventing a stored-XSS vector where valid image bytes saved as `.html` would be served with a script-executable `Content-Type`.
