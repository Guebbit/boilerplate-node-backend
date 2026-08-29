# src/infrastructure/adapters/image-signatures.ts

## Purpose

Identifies the actual image format of an uploaded file by inspecting its leading magic bytes, rather than trusting the client-supplied `Content-Type` or filename. Exists to close a class of stored-XSS and MIME-spoofing attacks where a file whose bytes are a valid PNG/JPEG/WebP is given a dangerous extension or served with a wrong `Content-Type`. Deliberately dependency-free: three formats are matched inline rather than via a library like `file-type`.

## Key elements

- **`ImageSignature`** (interface) — describes one accepted format: target `mime`, byte `offset` where the signature begins, and the exact `bytes` to match.
- **`IMAGE_SIGNATURES`** (readonly array) — the three accepted raster formats: PNG (8 bytes @ 0), JPEG (3 bytes @ 0), WebP (4 bytes @ 8, inside a RIFF container). SVG is explicitly excluded.
- **`HEADER_LENGTH`** — computed max of `offset + bytes.length` across all signatures; the number of bytes any reader must fetch.
- **`identifyImage(header: Buffer): string | undefined`** — pure function; scans a buffer against the signatures and returns the matching MIME type or `undefined`.
- **`identifyImageFile(filePath: string): Promise<string | undefined>`** — opens the file, reads only `HEADER_LENGTH` bytes, delegates to `identifyImage`. Returns `undefined` for any read error (the caller rejects either way).
- **`extensionForImage(mime: string | undefined): string | undefined`** — closed map from recognised MIME to storage extension (`png`, `jpg`, `webp`). Returns `undefined` for anything else.
- **`normaliseDeclaredImageMime(declared: string | undefined): string | undefined`** — folds the non-IANA alias `image/jpg` into `image/jpeg` so declared and sniffed types compare equal.

## Relationships

- **`tests/unit/infrastructure/adapters/image-signatures.test.ts`** — unit test suite covering the exported functions above.
- **`src/infrastructure/adapters/image-store.ts`** — consumes this module's exports (e.g. `extensionForImage`, `identifyImageFile`) when persisting uploaded images to disk.
- **`src/infrastructure/adapters/storage.ts`** — upstream storage adapter that the image-store depends on; this module's output (the canonical extension) feeds into the path/filename that storage writes.

## Notes

- **No SVG.** The codebase treats SVG as executable XML; accepting it would mean accepting script upload. This is a policy decision baked into the whitelist, not an oversight.
- **JPEG matches only 3 bytes** (`FF D8 FF`). What follows the SOI marker varies by encoder (JFIF, Exif, raw), so three is the maximum that is always identical.
- **WebP signature sits at offset 8** to skip the `RIFF` magic, which would otherwise also match WAV and AVI containers.
- **`identifyImageFile` swallows all read errors** and returns `undefined` rather than throwing. The caller is expected to reject `undefined`; distinguishing "file not found" from "not an image" provides no additional safety.
- **`extensionForImage` uses `mime ?? ''`** as the key, so an `undefined` input safely maps to `undefined` via a non-existent key rather than a type error.
