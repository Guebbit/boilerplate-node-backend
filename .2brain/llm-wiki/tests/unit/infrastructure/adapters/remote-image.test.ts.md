---
source: tests/unit/infrastructure/adapters/remote-image.test.ts
sha256: a68a489b4ad95fa8cd8da8df514b27654e14407b621605b3f019f3d7479be45e
generated_at: 2026-10-15T13:09:28.643837+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/adapters/remote-image.test.ts

## Purpose
Unit tests for `rehostRemoteImage`, the best-effort pipeline that downloads a remote avatar, quarantines the bytes, digests them into a stored image + thumbnail, and cleans up. The critical contract under test is that the function **always resolves** (never rejects) — every refusal or failure yields `undefined` so a signup can never fail over an avatar.

## Key elements
- **`serveResponse(statusCode, chunks)`** – Configures the mocked `node:https.request` to emit a `PassThrough`-based fake `IncomingMessage` with the given status and body chunks, fired on `end()` to mirror real request/response ordering.
- **`staging`** – A real `mkdtempSync` temp directory injected as `NODE_UPLOAD_STAGING_PATH` so no test writes into the production staging path.
- **`STORED`** – The fixed `{ imageUrl, thumbnailUrl }` shape the digest mock returns; used as the expected happy-path result.
- **`describe('rehostRemoteImage')`** – Six cases covering: absent URL; five unsafe-URL shapes (plaintext, credentials, loopback, private IP, not-a-URL); happy 200 download → quarantine → digest → remove; non-200 status; body exceeding the 5 MiB cap; and digest failure (quarantine must still be removed).

## Relationships
- **`src/infrastructure/adapters/remote-image.ts`** – System under test; `rehostRemoteImage` is the sole function exercised.
- **`src/infrastructure/adapters/ssrf-guard.ts`** – `resolveSafeOutboundTarget` is mocked to a safe value by default; the "refuses" cases swap in the **real** guard via `jest.requireActual` to verify rejection happens at the guard layer.
- **`src/infrastructure/adapters/image.worker.ts`** – `digestQuarantinedImage` is fully mocked; the test asserts it is called (or not) and that its rejection triggers cleanup.
- **`src/infrastructure/adapters/image-store.ts`** – `imageStore.quarantine` / `removeQuarantined` are mocked; the test asserts call order and that the quarantine key is passed through to the digest step.
- **`tests/support/stub.ts`** – `asStub` casts `PassThrough` instances to `IncomingMessage` / `ClientRequest` types so `serveResponse` can satisfy the `https.request` signature.
- **`tests/support/environment.ts`** – `setEnvironment` sets and resets `NODE_UPLOAD_STAGING_PATH` around each test and in `afterAll`.

## Notes
- The "refuses … without rejecting" cases intentionally **replace** the SSRF guard mock with the real implementation (`jest.requireActual`) so the assertion validates the guard's own logic, not a stub.
- The size-cap test uses exactly `5 * 1024 * 1024 + 1` bytes, encoding the 5 MiB limit implicitly; if the cap changes, this number must be updated.
- `serveResponse` delivers the body through `PassThrough` chunks rather than a single `end` payload, exercising the streaming/size-check path in the SUT.
- The happy-path assertion checks that `httpsRequest` is called with the **guard-pinned** hostname, port 443, the URL's original `path` including query string, and `GET` — pinning the connection to the SSRF-resolved target, not the URL's literal host.
- Staging temp dir is created with `mkdtempSync` and removed in `afterAll` with `{ recursive: true, force: true }`; forgetting the `afterAll` cleanup would leave orphan directories.
