---
source: src/infrastructure/adapters/remote-image.ts
sha256: a28f6a3d578a11ad2f9c10e44ee1d52a1be1ed467f9fd531586968fcb9e62254
generated_at: 2026-10-14T07:48:58.102103+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/adapters/remote-image.ts

## Purpose

Downloads a remote image URL (e.g. an avatar from an OAuth provider), runs it through the same quarantine-and-digest pipeline as a local upload, and returns the resulting local image/thumbnail URLs. This ensures no third-party URL is ever persisted, so a viewer's IP is never sent to an external host on every render. The operation is strictly best-effort: any failure resolves to `undefined` so that a missing avatar can never break the signup flow that requested it.

## Key elements

- **`rehostRemoteImage`** (export) — Public entry point. Accepts `string | undefined`; if the URL is falsy it resolves `undefined` immediately. Otherwise it chains `download → digestBytes` and swallows any error into a `logger.warn` + `undefined`.
- **`download`** (internal) — Issues a GET via `pinnedHttpsRequest` with a single `AbortSignal.timeout(5000)` covering DNS, connect, and body. Rejects any non-200 status (3xx is *not* followed) and delegates body reading to `readCapped`.
- **`readCapped`** (internal) — Accumulates `data` chunks into a `Buffer`; destroys the response stream the moment accumulated bytes exceed `MAX_DOWNLOAD_BYTES` (5 MiB, same as the upload default).
- **`digestBytes`** (internal) — Writes the downloaded `Buffer` to a UUID-named file under `uploadStagingPath()`, calls `imageStore.quarantine`, then `digestQuarantinedImage` (owner salt = the key's stem, matching the inline-upload convention). Cleans up the quarantine entry in `.finally` and the staged file in `.catch`.
- **`DOWNLOAD_TIMEOUT_MS` / `MAX_DOWNLOAD_BYTES`** — Module-level constants (5 s, 5 MiB).

## Relationships

- **`pinned-https.ts`** — Provides `pinnedHttpsRequest`, the only outbound HTTP primitive; enforces HTTPS and DNS pinning.
- **`image.worker.ts`** — Supplies `digestQuarantinedImage` and the `DigestedImageUrls` return type (the actual decode/transcode pipeline).
- **`image-store.ts`** — Supplies `imageStore.quarantine` / `imageStore.removeQuarantined` for the two-phase quarantine lifecycle.
- **`filesystem.ts`** — Supplies `deleteFile`, used to clean up the staged file on error.
- **`upload.ts` (middlewares)** — Supplies `uploadStagingPath` so the re-hosted file lands in the same directory as inline uploads.
- **`logger.ts`** — Used to `warn` when the re-host fails.
- **`oauth.ts`** — Expected caller; passes a provider-supplied avatar URL into `rehostRemoteImage` during account linking.
- **`remote-image.test.ts`** — Unit tests covering the download, cap, and digest paths in isolation.
- **`oauth-link.test.ts`** — Integration test exercising the full OAuth → re-host → persist flow.

## Notes

- **Never throws.** The only export is a `Promise` that resolves to `undefined` on every error path; callers must treat `undefined` as "no image available" and proceed without one.
- **No redirect following.** A 3xx response is a hard failure, not a location to chase. This is a deliberate policy (avoids open-redirect / SSRF surface).
- **Single timeout budget.** One `AbortSignal.timeout` covers DNS resolution + TCP connect + the entire body read; there is no separate per-phase timeout.
- **Owner salt convention.** The salt passed to `digestQuarantinedImage` is the quarantine key's stem (filename without extension), identical to what the inline-upload path produces — keeping both flows consistent.
- **Staged filename.** Uses `randomUUID().img` (literal `.img` extension, not a real image format) to avoid any format inference by the OS.
