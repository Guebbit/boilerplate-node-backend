---
source: src/modules/observability/tests/unit/get-observability-events.test.ts
sha256: 99dbd368511ad7bed6b7bd11cc986ce724618fb1f199a99ee43c6979dab99546
generated_at: 2026-09-27T15:05:55.011839+00:00
model: ollama:qwen3.8:27b
---

# src/modules/observability/tests/unit/get-observability-events.test.ts

## Purpose

Unit tests for the `getObservabilityEvents` Express handler. They verify that the handler does not write to the response itself (SSE owns it) and that it hands the streamer a permission-recheck closure wired to the correct key and cookie value.

## Key elements

- **`describe('GET /observability/events')`** — the test suite, two cases.
- **Test 1: "hands the raw response and a recheck to the streamer"** — asserts `streamObservabilityMetrics` is called with the raw `Response` and a `Function` (the recheck), confirming the handler delegates without touching the response.
- **Test 2: "wires the recheck to the same key and the cookie"** — invokes the recheck returned by the mocked streamer and asserts `stillHoldsKeyViaCookie` receives `(request, 'cookie.jwt', OBSERVABILITY_READ_KEY)`.
- **`cookieRequest()`** — local helper returning an `asStub<Request>` with `cookies: { jwt: 'cookie.jwt' }`, representing the already-validated state before the handler runs.
- **Mocks** — `streamObservabilityMetrics` is fully replaced; `stillHoldsKeyViaCookie` is partially replaced via the `...jest.requireActual` spread so the rest of the authorizations module stays intact.

## Relationships

- **`src/modules/observability/controllers/get-observability-events.ts`** — the module under test; provides `getObservabilityEvents` and the `OBSERVABILITY_READ_KEY` constant used in assertions.
- **`src/modules/observability/services/stream.ts`** — fully mocked; the handler's sole delegation target.
- **`src/kernel/middlewares/authorizations.ts`** — partially mocked; only `stillHoldsKeyViaCookie` is stubbed to verify the recheck wiring.
- **`tests/support/stub.ts`** — provides the `asStub<T>()` helper used to create typed Express `Request`/`Response` stand-ins without importing real Express instances.

## Notes

- The module-level doc comment explains *why* the recheck is critical: an SSE stream has no "next request" in which a revoked caller would be rejected, so the recheck closure is the only mid-stream revocation path.
- The partial-mock pattern (`...jest.requireActual`) is intentional — it keeps every other guard in `authorizations.ts` real while isolating the one function this test cares about.
- `beforeEach` clears all mocks; no setup beyond `asStub` is needed because the handler is a pure delegation.
