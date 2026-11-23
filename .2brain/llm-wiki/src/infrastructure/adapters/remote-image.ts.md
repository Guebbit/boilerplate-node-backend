---
source: src/infrastructure/adapters/remote-image.ts
source_sha256: 4f093991d476c77a6b544fadc08d74797c92bd06fbb22ebef0543274be92852d
context_sha256: baa38ab9cc0090fcfeea77be1c77eef353f6adbc38eb3cc2b77775fcdee785f5
generated_at: 2026-11-22T02:42:08.820380+00:00
model: claude-code:claude-sonnet-5-5
---

# src/infrastructure/adapters/remote-image.ts

## Purpose
Re-hosts a remote picture (e.g. a provider-supplied avatar): downloads it once, runs it through the same quarantine and digest pipeline an upload uses, and returns the two local URLs to persist. No third-party URL is stored, so viewers' IPs are never sent to another host. It is best-effort: any failure resolves to `undefined` so a missing avatar never fails the signup that requested it.

## Key elements
- `rehostRemoteImage(remoteUrl)` — the only export. Returns `Promise<DigestedImageUrls | undefined>`. Resolves `undefined` immediately for an empty or undefined URL. Otherwise it downloads, digests, and on any error logs a warning via `logger.warn` and resolves `undefined`.
- `download(rawUrl)` (internal) — GETs through `pinnedHttpsRequest` with a single 5 s `AbortSignal.timeout` covering resolve, connect and download. Any status other than 200 throws, and the response is drained with `response.resume()`. The body is read with `readCappedBytes`, capped at 5 MiB.
- `digestBytes(bytes)` (internal) — writes the bytes to a UUID-named `.img` file under `uploadStagingPath()` (creating the directory if needed) and quarantines it with `imageStore.quarantine`. It then calls `digestQuarantinedImage(key, ownerSalt)`, where the salt is the quarantine key's basename without its extension. The quarantined file is always removed afterwards with `imageStore.removeQuarantined`. If any step fails, the staged file is deleted with `deleteFile` and the error is rethrown.
- `DOWNLOAD_TIMEOUT_MS`, `MAX_DOWNLOAD_BYTES` — module constants (5000 ms, 5 MiB). The size cap matches an upload's default.

## Relationships
- `src/infrastructure/adapters/pinned-https.ts` — supplies `pinnedHttpsRequest`: https only, DNS pinned to the validated address, no redirects followed.
- `src/infrastructure/http/read-capped-body.ts` — supplies `readCappedBytes` to enforce the byte cap.
- `src/infrastructure/http/middlewares/upload.ts` — supplies `uploadStagingPath()`, so downloads are staged in the same directory as uploads.
- `src/infrastructure/adapters/image-store.ts` — supplies `imageStore`, whose `quarantine` and `removeQuarantined` methods handle the quarantine lifecycle.
- `src/infrastructure/adapters/image.worker.ts` — supplies `digestQuarantinedImage` and the `DigestedImageUrls` type, which is the return shape.
- `src/infrastructure/adapters/filesystem.ts` — `deleteFile` cleans up the staged file on failure.
- `src/infrastructure/adapters/logger.ts` — warns on a failed re-host.
- `src/modules/account/services/oauth.ts` and `src/modules/account/tests/integration/oauth-link.test.ts` — the signup/OAuth flow and its integration test are graph neighbors; the file's docs describe the caller as a signup that asks for an avatar.
- `tests/unit/infrastructure/adapters/remote-image.test.ts` — the unit test for this module.

## Notes
- Failures are swallowed on purpose. Callers cannot tell "no URL" from "fetch failed" and only see a warning in the logs.
- A 3xx response is treated as a failure, not followed.
- The staged file is only deleted in the error path. On success, cleanup is done by `removeQuarantined`.
