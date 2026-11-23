---
source: src/modules/observability/tests/unit/get-observability-events.test.ts
source_sha256: f483f995a8a7e51af650f19cb8a62d23301be9e8aa9c5f22fbd1f169e35c559a
context_sha256: 7568630290b41f39b0abf4ee6e48d3d1bb091706f0b35cec78b02eb2e8f1864f
generated_at: 2026-11-22T06:04:54.591111+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/observability/tests/unit/get-observability-events.test.ts

## Purpose
Unit tests for the `GET /observability/events` controller. They verify that the handler passes the raw Express response, the authenticated caller's id, and a permission-recheck callback to the SSE metrics streamer, and that it writes nothing to the response itself. The recheck matters because a long-lived stream has no "next request" on which a revoked caller would otherwise lose access.

## Key elements
- **`jest.mock('@kernel/middlewares/authorizations', …)`** — spreads the real module and replaces only `stillHoldsRuleViaCookie` with a `jest.fn()`; the other guards stay real.
- **`cookieRequest()`** — builds a stub `Request` with `sessionRecheck: jest.fn()` and `authContext: { id: 'staff-1' }`, mimicking what `requirePermissionViaCookie` leaves after admitting the caller.
- **`streamObservabilityMetrics`** — `jest.spyOn` on `observabilityService.streamObservabilityMetrics`, with its implementation replaced by a no-op in `beforeEach` so no real stream starts.
- **Test 1** — calls `getObservabilityEvents(request, response)` and asserts the streamer received `(response, 'staff-1', expect.any(Function))`. The response is an empty stub, so any write by the handler would fail.
- **Test 2** — extracts the third argument (the recheck) from the spy's first call, invokes it, and asserts `stillHoldsRuleViaCookie` was called with `(request, 'read', 'ObservabilitySnapshot')`.

## Relationships
- **`src/modules/observability/controllers/get-observability-events.ts`** — the handler under test.
- **`src/modules/observability/services/index.ts`** — supplies `observabilityService`, whose `streamObservabilityMetrics` is spied on.
- **`src/kernel/middlewares/authorizations.ts`** — `stillHoldsRuleViaCookie` is mocked here; the rest of the module is preserved.
- **`tests/support/stub.ts`** — `asStub` creates the partial `Request`/`Response` objects.

## Notes
- `jest.clearAllMocks()` runs in `beforeEach`, and the spy's no-op implementation is reapplied after each clear.
- The recheck is only checked for how it is wired (rule `'read'` on `'ObservabilitySnapshot'`, with the original request). Test 2 stubs the result as `true` via `mockResolvedValueOnce` and does not assert on the returned value.
