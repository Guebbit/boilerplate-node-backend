---
source: src/modules/observability/tests/unit/get-observability-events.test.ts
sha256: e2a37500281829c490091a3517667a7f9cbd0257d4001073f8af59d7af5ff463
generated_at: 2026-10-29T04:37:09.018326+00:00
model: ollama:qwen3.8:27b
---

# src/modules/observability/tests/unit/get-observability-events.test.ts

## Purpose

Unit test for the `GET /observability/events` controller handler. It verifies that the handler delegates the entire response lifecycle to the SSE streamer (writing nothing itself) and that the permission-recheck callback it passes is correctly wired to `stillHoldsRuleViaCookie` with the expected rule key and permission.

## Key elements

- **`cookieRequest()`** – factory that returns an `asStub<Request>` carrying a mock `sessionRecheck`, simulating the state left behind by `requirePermissionViaCookie` after admission.
- **`streamObservabilityMetrics`** – a `jest.spyOn` on `observabilityService.streamObservabilityMetrics`; cleared in `beforeEach` and given a no-op implementation so the test focuses on *what arguments* the handler passes rather than what the streamer does.
- **Partial `jest.mock` of `@kernel/middlewares/authorizations`** – spreads `jest.requireActual` and overrides only `stillHoldsRuleViaCookie`, leaving the rest of the module (e.g. `requirePermissionViaCookie`) real.
- **Test 1: "hands the raw response and a recheck to the streamer, and writes nothing itself"** – asserts `streamObservabilityMetrics` is called with `(response, expect.any(Function))`.
- **Test 2: "wires the recheck to the key and the request the stream connected with"** – invokes the recheck callback captured from the spy's call args and asserts it calls `stillHoldsRuleViaCookie(request, 'read', 'ObservabilitySnapshot')`.

## Relationships

- **`src/modules/observability/controllers/get-observability-events.ts`** – the module under test; the test calls `getObservabilityEvents` directly.
- **`src/modules/observability/services/index.ts`** – exports `observabilityService`; the test spies on its `streamObservabilityMetrics` method.
- **`src/kernel/middlewares/authorizations.ts`** – partially mocked to isolate `stillHoldsRuleViaCookie` while keeping the rest of the middleware module intact.
- **`tests/support/stub.ts`** – provides `asStub<T>()` used to create typed no-op stubs for `Request` and `Response`.

## Notes

- The recheck callback is the *only* authorization enforcement point for the lifetime of an SSE connection (no subsequent HTTP request occurs), which is why the test asserts its exact wiring rather than just its existence.
- The mock of the authorizations module is intentionally partial: other guards (e.g. `requirePermissionViaCookie`) are left real so they are not accidentally broken by changes to this test's setup.
- `streamObservabilityMetrics` is a **spy**, not a mock; the test never asserts the streamer's behavior, only that the handler calls it with the right arguments.
