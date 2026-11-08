---
source: src/infrastructure/adapters/image-signatures.ts
sha256: e3a3080b7403c43f25a4760f9454d8e68aa2f25a20e9a3e2447678378301f657
generated_at: 2026-11-08T03:19:20.402096+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/adapters/image-signatures.ts

## Purpose

Identifies an uploaded file's real image format by matching its leading bytes against a small, hand-maintained signature table, rather than trusting the client-supplied `Content-Type`. Exists because a static file server that labels by extension, or a decoder fed attacker-controlled input, makes a spoofable header a real security risk. Deliberately avoids a dependency like `file-type`: three signatures are easier to audit than a library.

## Key elements

- **`ImageFormat`** (interface) — Describes one format: MIME type, optional aliases, signature `offset`/`bytes`, optional `alsoRequires` extra markers (e.g. WebP needs both `RIFF` and `WEBP`), and the storage `extension`.
- **`SUPPORTED_IMAGE_FORMATS`** — The actual signature table, sourced from the generated `imageRuleData.formats` (upstream: `shared/rules/images.yaml`). Raster formats only; SVG is excluded.
- **`SIGNATURES_COVER_CONTRACT`** (exported const, type-level) — Compile-time proof via `SameMembers<AcceptedUploadType, SignedType>` that the signature table and the API contract list exactly the same MIME types. Fails `tsc` on drift in either direction.
- **`ACCEPTED_UPLOAD_MIMETYPES`** (exported `ReadonlySet<string>`) — Union of contract types and alias spellings; the set of declared `Content-Type` values the system will recognise.
- **`identifyImage(header: Buffer)`** (exported) — Returns the MIME type whose signature matches the buffer's leading bytes, or `undefined`.
- **`identifyImageFile(filePath: string)`** (exported, async) — Opens the file, reads only `HEADER_LENGTH` bytes, delegates to `identifyImage`. Catches all read errors and returns `undefined`. Always closes the handle in `finally`.
- **`extensionForImage(mime)`** (exported) — Maps a canonical MIME type back to its storage extension. Never derived from a client filename.
- **`normaliseDeclaredImageMime(declared)`** (exported) — Folds a non-IANA alias (e.g. `image/jpg`) into its canonical MIME so declared and sniffed types compare equal.
- **`hasMarker`** (private) — Checks whether a buffer contains a marker's bytes at the given offset.
- **`HEADER_LENGTH`** (private) — Computed as the max `offset + bytes.length` across all formats and their `alsoRequires` entries.

## Relationships

- **`src/infrastructure/http/middlewares/upload.ts`** — Consumes the exported `ACCEPTED_UPLOAD_MIMETYPES`, `normaliseDeclaredImageMime`, `identifyImage`/`identifyImageFile`, and `extensionForImage` to validate declared type, sniff actual type, and decide the on-disk extension.
- **`src/infrastructure/adapters/image.worker.ts`** — Runs image processing in a worker; relies on this module to confirm a file is a recognised raster before handing it to a decoder.
- **`scripts/contracts/asyncapi-bundles.ts`** — Generates or maintains the `@api/upload-types` contract (`ACCEPTED_UPLOAD_TYPES`, `AcceptedUploadType`) that this file cross-checks at compile time via `SIGNATURES_COVER_CONTRACT`.
- **`tests/unit/infrastructure/adapters/image-signatures.test.ts`** — Unit-tests the signature matching, alias normalisation, extension mapping, and the file-reading path.
- **`tests/unit/infrastructure/adapters/image.worker.test.ts`** — Exercises the worker path, which depends on `identifyImageFile` for its pre-decode validation.

## Notes

- **No SVG.** The table is raster-only by design; accepting SVG would mean accepting script upload. No amount of byte-sniffing mitigates that.
- **`alsoRequires`** exists solely for WebP, which needs two markers (`RIFF` at 0 *and* `WEBP` at 8). All other formats use only the primary `offset`/`bytes` pair.
- **`identifyImageFile` swallows all read errors** (ENOENT, permissions, etc.) and returns `undefined`. The caller is expected to reject the upload either way; distinguishing "missing file" from "wrong format" adds no safety.
- **`HEADER_LENGTH` is computed, not hardcoded.** Adding a longer signature to the YAML automatically extends the read window.
- **Extension is derived from the sniffed type, never from `originalname`.** Storing valid PNG bytes as `.html` would yield stored XSS once the upload directory is served statically.
- **The signature table is data, not code.** It lives in `images.generated.ts` (generated from `shared/rules/images.yaml`); the reasoning for each signature sits beside the data in that YAML.
