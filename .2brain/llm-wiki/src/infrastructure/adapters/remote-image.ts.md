---
source: src/infrastructure/adapters/remote-image.ts
sha256: e1cf1ce1e906a88106947c2e746b4fe531fa93b70205c1864362dbf59adb6720
generated_at: 2026-10-29T01:57:07.467893+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/adapters/remote-image.ts

## Purpose

Re-hosts a remote avatar image (e.g. from an OAuth provider) so that the platform never forwards a viewer's request to a third-party host on every render. It downloads the image once through a pinned-HTTPS guard, pushes the bytes through the same quarantine-and-digest pipeline as a local upload, and returns two local URLs. The operation is best-effort: any failure resolves to `undefined` so that a missing avatar can never break the signup that requested it.

## Key elements

- **`rehostRemoteImage(remoteUrl)`** — sole export. Accepts a URL (or `undefined`), downloads, digests, and returns `DigestedImageUrls | undefined`. All errors are caught and logged as a warning; the caller always resolves.
- **`download(rawUrl)`** — internal. Issues a `GET` via `pinnedHttpsRequest` with a single 5 s `AbortSignal`. Rejects any non-200 status and reads at most 5 MiB through `readCappedBytes`.
- **`digestBytes(bytes)`** — internal. Writes the buffer to a UUID-named file in the upload staging directory, calls `imageStore.quarantine`, then `digestQuarantinedImage` (using the key stem as the owner salt, matching the inline-upload convention). Always removes the quarantined entry in `.finally`; on error, deletes the staged file before re-throwing.
- **Constants** — `DOWNLOAD_TIMEOUT_MS` (5 000) and `MAX_DOWNLOAD_BYTES` (5 MiB, same default as the upload middleware).

## Relationships

- **`pinned-https.ts`** — `download` delegates the actual GET to `pinnedHttpsRequest` (HTTPS-only, DNS-pinned, no-redirect).
- **`read-capped-body.ts`** — `download` reads the response stream with `readCappedBytes` to enforce the size cap.
- **`upload.ts` (middleware)** — supplies `uploadStagingPath()` so the re-hosted file lands in the same staging area as user uploads.
- **`image-store.ts`** — `digestBytes` calls `imageStore.quarantine` and `imageStore.removeQuarantined` for the lifecycle of the intermediate file.
- **`image.worker.ts`** — `digestBytes` calls `digestQuarantinedImage` to produce the final `DigestedImageUrls` (full + thumbnail).
- **`filesystem.ts`** — `digestBytes` calls `deleteFile` to remove the staged file if digesting fails.
- **`logger.ts`** — `rehostRemoteImage` logs a `warn` with the error when the pipeline fails.
- **`oauth.ts` / `oauth-link.test.ts`** — downstream consumer: the OAuth signup flow calls `rehostRemoteImage` to persist a locally-hosted avatar.
- **`remote-image.test.ts`** — unit tests for this module.

## Notes

- The owner salt passed to `digestQuarantinedImage` is the key's filename stem (without extension), deliberately matching the inline-upload path so both code paths produce byte-identical digests for the same image.
- A 3xx response is treated as a hard failure; the module never follows redirects.
- The staging file is cleaned up on both success (quarantine removal) and failure (explicit `deleteFile`), but the final output files managed by `digestQuarantinedImage` are not touched here.
