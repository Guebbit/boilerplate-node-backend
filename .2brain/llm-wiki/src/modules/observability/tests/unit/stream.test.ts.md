---
source: src/modules/observability/tests/unit/stream.test.ts
source_sha256: 2719eb9f477836d7c0436a5ff56097067957d80a3f0e1070e78a8e7ecdb7e311
context_sha256: 35ece63dce9b961a9a540981573543dc97642dbe019c11445fb272f683b3e5a3
generated_at: 2026-11-22T06:06:33.307204+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/observability/tests/unit/stream.test.ts

## Purpose
Unit tests for the SSE metrics stream in `src/modules/observability/services/stream.ts`. They check the behaviors that fail silently from outside the module: the wire format (`event:`/`data:` lines and the blank-line terminator), teardown on disconnect (timers cleared, entry removed from the module-level `Set`), and error absorption (rejected metrics reads or writes to a dropped socket must not escape an interval callback). `getHttpRequestCounters` is mocked and Jest's fake timers are used, so frames are deterministic.

## Key elements
- `getHttpRequestCounters` – a `jest.fn` returning `{ totalRequests: 10, totalErrors: 2 }`. It is wired in through `jest.mock('../../http-readback', ...)` and reset in `beforeEach`.
- `UPDATE_INTERVAL_MS` (5000), `HEARTBEAT_INTERVAL_MS` (15_000) and `REVERIFY_INTERVAL_MS` (30_000) – interval constants copied into the test, so a change to the module's timings gets noticed.
- `FakeResponse` / `makeResponse()` – a hand-built Express `Response` stub (made with `asStub`). It records every `write` into `frames`, captures headers set via `setHeader`, and exposes `status`, `flushHeaders`, `write` and `end` mocks. `disconnect()` fires the registered `close` handlers.
- `parseFrame(frame)` – splits a frame into `event`, the parsed JSON `payload`, and the trailing `terminator` lines.
- `reportedClients()` – reads the open-connection count through `buildObservabilityPayload().realtime.sseClients`, the only place the count is published.
- `open(reverify?)` – opens a stream for `'staff-1'` with a recheck that passes by default. It tracks each fake in `opened`, and `afterEach` disconnects them all so the module-level `Set` starts empty.
- Test groups (visible portion):
  - `buildObservabilityPayload`: memory, http and connection fields; validation against `ObservabilityMetricsPayloadSchema`; an ISO-8601 timestamp; uptime floored to whole seconds.
  - Open-connection count: incremented per stream and released on disconnect.
  - Opening a stream: status 200, the four SSE headers, an immediate header flush, an immediate `observability.metrics.snapshot` frame, a frame ending in `\n\n`, and a single-line `data:` payload.
  - The two timers: `observability.metrics.updated` every 5s, nothing earlier, and `observability.heartbeat` on its own 15s timer (one heartbeat and three updates in 15s).
  - Permission recheck: no call before 30s, and rechecks every 30s while it keeps passing. The rest of this group is not shown.

## Relationships
- Tests `buildObservabilityPayload` and `streamObservabilityMetrics` from `src/modules/observability/services/stream.ts`. The stream is called as `streamObservabilityMetrics(response, 'staff-1', reverify)`.
- Imports `ObservabilityMetricsPayloadSchema` from `src/types/index.ts` (via `@types`) to check that a built payload satisfies the contract.
- Imports `asStub` from `tests/support/stub.ts` (via `@tests/stub`) to type the fake response as an Express `Response`.
- Mocks `../../http-readback` (`getHttpRequestCounters`), which the stream uses for its HTTP counters.

## Notes
- The `jest.mock` call comes before the import of the stream module, so the mock is in place when the module loads.
- Async tests advance time with `jest.advanceTimersByTimeAsync`, and `advanceTimersByTimeAsync(0)` is used to let the initial snapshot resolve.
- The uptime test comments that the floor is shared with the process-snapshot reader (`src/modules/observability/services/process-snapshot.ts`) and `GET /observability/health`. Rounding in one and flooring in the other previously made the two disagree by a second.
- The fake response records bytes directly rather than using a real socket, which makes it easy to assert exact frame text and to trigger `close` on demand.
