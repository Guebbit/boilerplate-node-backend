---
source: src/modules/observability/tests/unit/get-observability-events.test.ts
sha256: 1bd69800905b03fb423cd44851ba5f13223510f24f825e31405c68107d868384
generated_at: 2026-10-15T10:57:13.025735+00:00
model: ollama:qwen3.8:27b
---

# src/modules/observability/tests/unit/get-observability-events.test.ts

## Purpose

Unit tests for the `GET /observability/events` handler. They verify that the controller delegates entirely to the SSE streamer (writing nothing to the response itself) and that the permission recheck it hands over is correctly wired to the caller's request and the observability read key.

## Key elements

- **`cookieRequest()`** — local helper that builds a stub `Request` carrying a `sessionRecheck` mock, representing the state left by `requirePermissionViaCookie` after admitting the caller.
- **Test: "hands the raw response and a recheck to the streamer"** — asserts `streamObservabilityMetrics` is called with the response and a function, and that the handler performs no other response writes.
- **Test: "wires the recheck to the key and the request"** — invokes the recheck callback extracted from the mock call and asserts it delegates to `stillHoldsKeyViaCookie(request, OBSERVABILITY_READ_KEY)`.
- **Mocks** — `streamObservabilityMetrics` (fully replaced) and `stillHoldsKeyViaCookie` (replaced while keeping the rest of the authorizations module real via `jest.requireActual` spread).

## Relationships

- **`src/modules/observability/controllers/get-observability-events.ts`** — the unit under test; provides `getObservabilityEvents` and `OBSERVABILITY_READ_KEY`.
- **`src/modules/observability/services/stream.ts`** — mocked; the SSE streamer that receives the raw response and the recheck closure.
- **`src/kernel/middlewares/authorizations.ts`** — partially mocked; only `stillHoldsKeyViaCookie` is stubbed so the test can assert the recheck targets the right key without pulling in other guard logic.
- **`tests/support/stub.ts`** — provides `asStub<T>` for creating minimally typed mock objects (Request, Response).

## Notes

- The handler is expected to write **nothing** to the response before handing it off; any write would terminate the SSE stream before it starts.
- The recheck closure is the sole enforcement point after initial admission — there is no "next request" on an open SSE stream, so a revoked caller is caught only when the recheck fires.
- The authorizations mock intentionally spreads `jest.requireActual` to keep sibling guards (e.g., `requirePermissionViaCookie`) in their real implementations; only the recheck function is stubbed.
