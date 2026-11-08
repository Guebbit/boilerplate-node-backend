---
source: tests/unit/infrastructure/adapters/remote-image.test.ts
sha256: a68a489b4ad95fa8cd8da8df514b27654e14407b621605b3f019f3d7479be45e
generated_at: 2026-11-08T10:10:26.701900+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/adapters/remote-image.test.ts

## Purpose
Unit tests for `rehostRemoteImage`, verifying that the download-then-digest pipeline for re-hosting a remote avatar image resolves `undefined` (never throws) on any failure, and returns the local `{ imageUrl, thumbnailUrl }` pair on success. Network (`node:https`), the SSRF guard, the image worker, and the image store are all mocked so no real socket or disk I/O occurs.

## Key elements
- **`serveResponse(statusCode, chunks)`** – Test helper that configures the mocked `https.request` to emit a `PassThrough`-based response with the given status and body chunks, simulating a real `IncomingMessage` stream.
- **`staging`** – A `mkdtempSync` temp directory injected via `NODE_UPLOAD_STAGING_PATH` so the production staging path is never touched; removed in `afterAll`.
- **`STORED`** – The canonical digest result (`/img/a.webp` + `/img/a-thumb.webp`) that the success-path assertions compare against.
- **`describe('rehostRemoteImage')`** – Contains six test cases:
  - Absent URL → resolves `undefined`.
  - Parameterised unsafe URLs (plaintext, credentials, loopback, private, invalid) → resolves `undefined`; these swap in the **real** `resolveSafeOutboundTarget` to exercise the actual guard logic.
  - Successful 200 → asserts the pinned connection options, `quarantine` call, `digestQuarantinedImage` call with key + name, and `removeQuarantined` call.
  - Non-200 (302) → resolves `undefined`, digest never called.
  - Body exceeding the 5 MiB cap → resolves `undefined`, quarantine never called.
  - Digest rejects → resolves `undefined` **and** `removeQuarantined` is called (cleanup guarantee).

## Relationships
- **`src/infrastructure/adapters/remote-image.ts`** – The unit under test; `rehostRemoteImage` is the sole function exercised.
- **`src/infrastructure/adapters/ssrf-guard.ts`** – `resolveSafeOutboundTarget` is mocked by default but replaced with the real implementation for the unsafe-URL cases.
- **`src/infrastructure/adapters/image.worker.ts`** – `digestQuarantinedImage` is fully mocked; its return/rejection drives the success and failure paths.
- **`src/infrastructure/adapters/image-store.ts`** – `imageStore.quarantine` / `imageStore.removeQuarantined` are mocked to verify the quarantine → digest → cleanup lifecycle.
- **`tests/support/environment.ts`** – `setEnvironment` injects `NODE_UPLOAD_STAGING_PATH` pointing at the temp dir; reset in `afterAll`.
- **`tests/support/stub.ts`** – `asStub` is used to cast `PassThrough` streams into the `IncomingMessage` / `ClientRequest` shapes the code expects.

## Notes
- **Never-throws contract:** Every failure mode (bad URL, non-200, size cap, digest error) must resolve `undefined`, not reject. This is the file's central invariant and is asserted in every failure test.
- **SSRF guard is real for unsafe-URL tests:** Those cases deliberately swap the mock for the production `resolveSafeOutboundTarget` so that the actual DNS/protocol checks run; the rest of the suite uses the mock.
- **Temp-dir lifecycle:** The staging directory is created at module load and removed in `afterAll`; forgetting to reset `NODE_UPLOAD_STAGING_PATH` in `afterAll` would leak the env var into other suites.
- **`PassThrough` as fake stream:** The helper relies on `PassThrough` to faithfully exercise the `destroy(error)` and chunked-write paths of the production code without a real socket.
