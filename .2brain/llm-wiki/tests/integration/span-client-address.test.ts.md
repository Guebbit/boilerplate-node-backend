---
source: tests/integration/span-client-address.test.ts
sha256: 58d022646292ab0f9758b69460752f39c7cce28e50dd4e5d168a35527703aabd
generated_at: 2026-11-15T00:23:30.652218+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/span-client-address.test.ts

## Purpose

Integration test that verifies a server span's `client.address` is derived from Express's `request.ip` (which honours `trust proxy`) rather than the leftmost `X-Forwarded-For` entry a caller can write. It also proves the real security stamping middleware (from `installSecurity`) executes *after* `trust proxy` resolution.

## Key elements

- **`appWithSpan()`** — Builds an Express app wired with: (1) a stub `Span` (via `asStub`), (2) a middleware that calls `onIncomingRequest(span, incoming)` to simulate what `HttpInstrumentation`'s `requestHook` does, and (3) the real `installSecurity`. Returns `{ app, setAttribute }` for assertions.
- **Test: "digests request.ip, not the leftmost X-Forwarded-For…"** — With `NODE_TRUST_PROXY_HOPS=1` and `NODE_LOG_PERSONAL_FIELDS=hash`, sends `X-Forwarded-For: 198.51.100.99, 203.0.113.7` and asserts `setAttribute` was last called with `('client.address', correlationDigest('203.0.113.7'))`.
- **Test: "is left alone in plain mode"** — Same trust-proxy config but `NODE_LOG_PERSONAL_FIELDS=plain`; asserts `setAttribute` is never called.

## Relationships

- **`src/app/security.ts`** — `installSecurity` is imported and mounted; the test's existence confirms its stamping middleware runs after `trust proxy` processing.
- **`src/infrastructure/runtime/otel-sdk.ts`** — `onIncomingRequest` is the function under test; the middleware in `appWithSpan` invokes it exactly as the real OTel `requestHook` would.
- **`src/infrastructure/security/pseudonymise.ts`** — `correlationDigest` produces the expected hashed value asserted in the first test.
- **`tests/support/environment.ts`** — `withEnvironmentOverrides` supplies per-test `NODE_TRUST_PROXY_HOPS` and `NODE_LOG_PERSONAL_FIELDS` values.
- **`tests/support/stub.ts`** — `asStub<Span>` constructs the lightweight span double (no real OTel SDK in the test worker).
- **`tests/unit/infrastructure/runtime/otel-sdk.test.ts`** — Unit-level counterpart covering `onIncomingRequest` in isolation; this file covers the same function through a full Express request cycle.

## Notes

- The span is a **stub**; OTel instrumentation is never started. Only `onIncomingRequest` is called manually.
- Assertions use `toHaveBeenLastCalledWith`, not `toHaveBeenCalledWith`, because `onIncomingRequest` may set multiple attributes on the span.
- The stub's initial `attributes` object (`{ 'client.address': '198.51.100.99' }`) is never read by the assertions; it exists only to satisfy the `Span` type shape.
