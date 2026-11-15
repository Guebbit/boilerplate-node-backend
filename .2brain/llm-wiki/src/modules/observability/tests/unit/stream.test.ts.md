---
source: src/modules/observability/tests/unit/stream.test.ts
sha256: 87e0ff1bdecc8e383a64d901a52d7225f3ec97b4fc8896bde81fdd43872d70e7
generated_at: 2026-11-14T20:31:21.454864+00:00
model: ollama:qwen3.8:27b
---

# src/modules/observability/tests/unit/stream.test.ts

## Purpose

Unit test suite for the SSE (Server-Sent Events) metrics stream. It verifies the three externally-observable, silently-failing concerns of the stream module — SSE wire-format correctness, interval teardown on disconnect, and error absorption inside interval callbacks — while also asserting the shape and contract-compliance of the metrics payload. All timers are faked and `getHttpRequestCounters` is mocked so frames are deterministic.

## Key elements

- **`makeResponse()`** — Builds a hand-crafted `FakeResponse` (via `asStub<Response>`) that captures every string passed to `write`, records `setHeader` calls, and exposes a `disconnect()` helper that fires registered `close` handlers.
- **`parseFrame(frame)`** — Splits a written SSE frame back into `event`, `payload`, and `terminator` (the trailing `['', '']` that proves the blank-line boundary is present).
- **`reportedClients()`** — Convenience helper that calls `buildObservabilityPayload()` and extracts `payload.realtime.sseClients`.
- **`open(reverify?)`** — Opens a stream through `streamObservabilityMetrics` with a controllable recheck predicate; tracks the fake so `afterEach` can disconnect it.
- **`buildObservabilityPayload` tests** — Asserts memory/http/realtime fields, AsyncAPI schema conformance, ISO-8601 timestamp, and floor-to-whole-seconds uptime.
- **Timer tests** — Verifies the 5 s update tick, the 15 s heartbeat, and the 30 s permission recheck cadence; confirms the stream `end`s on a failed recheck.
- **`jest.mock('../../http-readback')`** — Replaces `getHttpRequestCounters` with a controllable jest mock so the counters in every frame are known constants.

## Relationships

- **`src/modules/observability/services/stream.ts`** — The module under test; the suite exercises `buildObservabilityPayload` and `streamObservabilityMetrics` directly.
- **`src/types/index.ts`** — Provides `ObservabilityMetricsPayloadSchema` (a Zod/valibot-style schema) used to validate that the built payload matches the AsyncAPI contract.
- **`tests/support/stub.ts`** — Supplies `asStub<T>()`, which casts a partial object to a full `T` type so the hand-built `FakeResponse` can be passed where an Express `Response` is expected.

## Notes

- The file intentionally uses a **hand-built response** rather than a real Express/Node socket: the goal is to read exact written bytes and fire `close` on demand, which a real socket makes non-deterministic.
- `afterEach` disconnects every opened stream and clears the module-level `Set`, ensuring each test starts with zero tracked clients.
- The recheck-failure path asserts `end` is called **directly** (not inferred from timer state) so a missing `clearInterval` or a leaked `Set` entry would be caught.
- The `terminator` check in `parseFrame` (`['', '']`) is the guard against the "server looks healthy but the client buffers forever" failure mode — a missing trailing `\n\n` is the most common silent SSE bug.
- `src/kernel/registry.ts` appears in the dependency graph (likely as a transitive dependency of the mocked `http-readback` module) but is not directly imported or exercised by this test file.
