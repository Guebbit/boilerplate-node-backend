---
source: tests/unit/infrastructure/adapters/pinned-https.test.ts
sha256: 0cc106b35e18c2a5d7dbd49757a9c4b4f79a36f8b2729a3312c45acbe478f13e
generated_at: 2026-11-08T10:09:51.378883+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/adapters/pinned-https.test.ts

## Purpose

Unit tests for `pinnedHttpsRequest`, verifying that it resolves a URL through the SSRF guard first and then issues an HTTPS request to the **original** hostname using the guard's pinned DNS lookup. Both `node:https` and the guard are mocked (the two I/O seams), so no socket is ever opened.

## Key elements

- **Module-level mocks** — `node:https` (`request`) and `@infrastructure/adapters/ssrf-guard` (`resolveSafeOutboundTarget`) are replaced with `jest.fn()`. The guard mock uses `requireActual` so `SsrfRefusedError` remains the real class.
- **`pinnedLookup`** (`jest.fn()`) — stands in for the guard's pinned `lookup` callback; identity-checked in request options.
- **`response`** — a typed stub of `IncomingMessage` (`statusCode: 204`) representing the fake server's reply.
- **`outgoing`** — a `PassThrough` stream with a mock `end`; `beforeEach` wires `end` to fire the `onResponse` callback, mimicking real server behaviour (response only after the request is fully sent).
- **`describe('pinnedHttpsRequest()')`** — six cases covering:
  - Correct options (original hostname, default port 443, path, method, `lookup` identity, signal)
  - Explicit port in the URL is preserved (8443)
  - Headers are passed through and the body is written via `outgoing.end`
  - Resolves with the raw response object (no body reading)
  - Rejects when the request stream emits an `error` event
  - Rejects with `SsrfRefusedError` and never calls `httpsRequest` when the guard refuses the URL

## Relationships

- **`src/infrastructure/adapters/pinned-https.ts`** — the system under test; the test imports and exercises `pinnedHttpsRequest`.
- **`src/infrastructure/adapters/ssrf-guard.ts`** — provides `resolveSafeOutboundTarget` (mocked) and `SsrfRefusedError` (real class used in assertions). The test asserts the guard is called before any request and that a refusal short-circuits the request entirely.
- **`tests/support/stub.ts`** — supplies the `asStub<T>()` helper used to satisfy TypeScript's nominal typing on mock return values (`IncomingMessage`, `ReturnType<typeof httpsRequest>`).

## Notes

- The `outgoing.end` mock is intentionally wired to invoke `onResponse` *inside* `end`, not immediately. This mirrors a real HTTP server (response arrives after the request is complete) and means the "resolves with the response" test implicitly depends on `end` being called.
- `jest.clearAllMocks()` runs in `afterEach` but the `outgoing` reference is **reassigned** in `beforeEach`; the "rejects when the request errors" case overrides `httpsRequest`'s implementation locally and does not reset `outgoing`.
- The guard mock spreads `requireActual`, so any other exports of `ssrf-guard` remain real. Only `resolveSafeOutboundTarget` is intercepted.
