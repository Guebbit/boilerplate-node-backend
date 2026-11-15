---
source: src/modules/observability/tests/unit/get-observability-events.test.ts
sha256: afb337f2c77e51a6ba0239b4e0ccf607d8c7b147c725c1a127d802c27130cc0a
generated_at: 2026-11-14T20:30:33.957661+00:00
model: ollama:qwen3.8:27b
---

# src/modules/observability/tests/unit/get-observability-events.test.ts

## Purpose

Unit tests for the `getObservabilityEvents` controller (the `GET /observability/events` endpoint). Verifies that the handler delegates entirely to the SSE streamer and wires a permission-recheck callback correctly, without writing anything to the response itself.

## Key elements

- **`cookieRequest()`** – Factory returning a typed stub `Request` carrying `sessionRecheck` and `authContext: { id: 'staff-1' }`, simulating what `requirePermissionViaCookie` leaves behind.
- **`streamObservabilityMetrics` spy** – `jest.spyOn(observabilityService, 'streamObservabilityMetrics')`, stubbed to return `undefined` so the test only inspects arguments.
- **Partial mock of `authorizations`** – Spreads `jest.requireActual` and replaces only `stillHoldsRuleViaCookie` with a `jest.fn()`, leaving all other guards in that module untouched.
- **Test 1** – Asserts the handler calls `streamObservabilityMetrics(response, 'staff-1', expect.any(Function))` and writes nothing to the response before the streamer takes over.
- **Test 2** – Extracts the third argument (the recheck callback) from the spy's call record, awaits it, and asserts it invokes `stillHoldsRuleViaCookie(request, 'read', 'ObservabilitySnapshot')`.

## Relationships

- **`src/modules/observability/controllers/get-observability-events.ts`** – The function under test (`getObservabilityEvents`).
- **`src/modules/observability/services/index.ts`** – Provides `observabilityService`, whose `streamObservabilityMetrics` method is spied on.
- **`src/kernel/middlewares/authorizations.ts`** – Source of `stillHoldsRuleViaCookie`, the only exported symbol mocked in this file.
- **`tests/support/stub.ts`** – Supplies the `asStub<T>()` helper used to create minimally-typed request/response stand-ins.

## Notes

- The module doc comment explains *why* the recheck is critical: an SSE stream has no "next request" to re-authorize, so the only enforcement point is the in-stream callback.
- The streamer mock returns `undefined` (not a fake stream) because the test only cares about call arguments; the real streamer would take ownership of the response object for its entire lifetime.
- Only `stillHoldsRuleViaCookie` is replaced; the remaining exports of the authorizations module are loaded via `requireActual` so other guards still run if the controller invokes them.
