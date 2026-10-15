---
source: tests/unit/infrastructure/adapters/pinned-https.test.ts
sha256: 0cc106b35e18c2a5d7dbd49757a9c4b4f79a36f8b2729a3312c45acbe478f13e
generated_at: 2026-10-15T13:08:47.294469+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/adapters/pinned-https.test.ts

## Purpose

Unit tests for `pinnedHttpsRequest`, verifying that it runs the SSRF guard first, then issues an HTTPS request to the **original** hostname using the guard's pinned DNS lookup. Both `node:https` and the guard module are fully mocked, so no real socket or DNS resolution occurs.

## Key elements

- **`pinnedLookup`** — a `jest.fn()` standing in for the guard's `lookup` callback; asserted by identity to prove the correct lookup is forwarded to the request options.
- **`response`** — an `asStub<IncomingMessage>` with `statusCode: 204`; the canned reply the fake "server" sends.
- **`outgoing`** — a `PassThrough` stream augmented with a mockable `.end`; records the body written and triggers the response callback (simulating a server answering once the request ends).
- **`beforeEach`** — wires the guard mock to resolve a safe target, and the `httpsRequest` mock to return `outgoing` and call the response callback on `.end()`.
- **Test cases** (one per `it`):
  - Default port 443 is used when the URL omits one.
  - The URL's explicit port (e.g. 8443) is honoured.
  - Headers are passed through and the body is written via `.end()`.
  - The resolved value is the raw response (not consumed/read).
  - A stream `'error'` event rejects the promise.
  - When the guard rejects (`SsrfRefusedError`), `httpsRequest` is **never** called.

## Relationships

- **`src/infrastructure/adapters/pinned-https.ts`** — the module under test; imports `pinnedHttpsRequest`.
- **`src/infrastructure/adapters/ssrf-guard.ts`** — provides `resolveSafeOutboundTarget` (mocked) and `SsrfRefusedError` (real class used in assertions). The guard is the security seam this test exercises.
- **`tests/support/stub.ts`** — provides `asStub<T>()`, a helper that satisfies TypeScript while creating a minimal mock object; used for `response`, `outgoing`, and the `httpsRequest` return value.

## Notes

- Both external seams (`node:https` and `ssrf-guard`) are `jest.mock`-ed at module level, so the test is hermetic — no network, no DNS.
- The `httpsRequest` mock defers calling the response callback until `.end()` is invoked, mirroring real server behaviour and ensuring the body-write path is exercised.
- The SSRF-rejection test asserts `httpsRequest` was **not** called, confirming the guard runs strictly before any outbound I/O.
