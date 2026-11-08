---
source: src/infrastructure/adapters/remote-image.ts
sha256: e1cf1ce1e906a88106947c2e746b4fe531fa93b70205c1864362dbf59adb6720
generated_at: 2026-11-08T03:23:25.526467+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/adapters/remote-image.ts

## Purpose

Downloads a remote avatar URL, pushes the bytes through the same quarantine-and-digest pipeline an inline upload uses, and returns the two local image/thumbnail URLs for persistence. This exists so a viewer's IP is never sent to a third-party host on every page render — the image is fetched once at signup and served from local storage thereafter.

## Key elements

- **`rehostRemoteImage(remoteUrl)`** *(exported)* — The public entry point. Accepts a URL or `undefined`; resolves to `DigestedImageUrls` on success or `undefined` on any failure. Never rejects.
- **`download(rawUrl)`** *(internal)* — Performs a single GET via `pinnedHttpsRequest` with a 5-second `AbortSignal.timeout`. Rejects on non-200 or on body exceeding 5 MiB.
- **`digestBytes(bytes)`** *(internal)* — Writes the buffer to a UUID-named file under the upload staging dir, calls `imageStore.quarantine`, then `digestQuarantinedImage`. Cleans up the staged file on error; always removes the quarantine entry in a `.finally`.
- **`DOWNLOAD_TIMEOUT_MS`** — 5 000 ms budget covering DNS, TLS, and body read.
- **`MAX_DOWNLOAD_BYTES`** — 5 MiB, matching the inline-upload default.

## Relationships

- **`pinned-https.ts`** — `download` delegates the actual HTTP GET to `pinnedHttpsRequest` (HTTPS-only, DNS-pinned, no redirect follow).
- **`read-capped-body.ts`** — `download` streams the response through `readCappedBytes` to enforce the size cap.
- **`upload.ts`** — `digestBytes` calls `uploadStagingPath()` to reuse the same staging directory the upload middleware uses.
- **`image-store.ts`** — `digestBytes` calls `imageStore.quarantine` / `imageStore.removeQuarantined` for the same isolation flow as user uploads.
- **`image.worker.ts`** — `digestBytes` invokes `digestQuarantinedImage` to produce the final `DigestedImageUrls`.
- **`filesystem.ts`** — `digestBytes` calls `deleteFile` to remove the staged file if the pipeline throws.
- **`logger.ts`** — `rehostRemoteImage` logs a `warn` (with the error) before returning `undefined`.
- **`modules/account/services/oauth.ts`** — Primary caller; passes the provider-supplied avatar URL during account linking.
- **`modules/account/tests/integration/oauth-link.test.ts`** — Exercises the full rehost path in an integration test.
- **`tests/unit/infrastructure/adapters/remote-image.test.ts`** — Unit tests for the download, digest, and error-resolution behavior.

## Notes

- **Best-effort contract:** The function never throws. Every error path (network, non-200, oversized body, digest failure) resolves to `undefined`, so a missing avatar can never break signup.
- **No redirects:** A 3xx response is treated as a hard failure. The code does not follow `Location` headers, preventing an untrusted URL from redirecting to an arbitrary host.
- **Salt derivation:** The owner salt passed to `digestQuarantinedImage` is `path.basename(key, path.extname(key))` — the quarantine key with its extension stripped — matching the convention used by the inline upload path.
- **Staging cleanup is best-effort:** On a pipeline error the staged file is deleted, but if the process crashes between `writeFile` and the `.catch`, an orphan file may remain in the staging dir.
