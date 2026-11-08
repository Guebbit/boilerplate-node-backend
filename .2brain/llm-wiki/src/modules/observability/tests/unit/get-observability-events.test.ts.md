---
source: src/modules/observability/tests/unit/get-observability-events.test.ts
sha256: e2a37500281829c490091a3517667a7f9cbd0257d4001073f8af59d7af5ff463
generated_at: 2026-11-08T06:42:44.841600+00:00
model: ollama:qwen3.8:27b
---

# src/modules/observability/tests/unit/get-observability-events.test.ts

## Purpose

Unit test for the `GET /observability/events` controller handler. It verifies that the handler delegates entirely to the SSE streamer (passing the raw `Response` and a permission-recheck callback) and does not write to the response itself. The recheck path is the focus: it is the only mechanism that can revoke a caller mid-stream, since an SSE connection has no "next request" to trigger a fresh authorization check.

## Key elements

- **`cookieRequest()`** – builds a minimal stub `Request` carrying a `sessionRecheck` mock, simulating the state left behind by `requirePermissionViaCookie`.
- **`streamObservabilityMetrics`** (spy on `observabilityService`) – the service method the handler must call; its arguments are the assertion surface.
- **`jest.mock('@kernel/middlewares/authorizations', …)`** – replaces only `stillHoldsRuleViaCookie` with a `jest.fn()` while preserving the rest of the module.
- **`describe('GET /observability/events')`** – two test cases:
  - *Hands the raw response and a recheck to the streamer* – asserts the handler calls `streamObservabilityMetrics(response, someFunction)` and writes nothing itself.
  - *Wires the recheck to the key and the request the stream connected with* – invokes the recheck callback and asserts it calls `stillHoldsRuleViaCookie(request, 'read', 'ObservabilitySnapshot')`.

## Relationships

- **`src/modules/observability/controllers/get-observability-events.ts`** – system under test; the handler under verification.
- **`src/modules/observability/services/index.ts`** – provides `observabilityService`, whose `streamObservabilityMetrics` is spied on.
- **`src/kernel/middlewares/authorizations.ts`** – partially mocked to isolate `stillHoldsRuleViaCookie`; all other guards in that module are left intact.
- **`tests/support/stub.ts`** – supplies the `asStub` helper used to construct lightweight `Request`/`Response` objects.

## Notes

- Only `stillHoldsRuleViaCookie` is mocked from the authorizations module; other guards (`requirePermissionViaCookie`, etc.) remain real. This keeps the mock surface minimal.
- The test does **not** assert HTTP status codes or headers—the SSE streamer owns the response for its lifetime, so the handler must not touch it.
- The recheck callback is invoked *after* the handler returns, meaning the test exercises the closure the handler captures (the original `request` object and the fixed rule key `'read'` / resource `'ObservabilitySnapshot'`).
