---
source: tests/unit/infrastructure/runtime/shutdown-infra.test.ts
sha256: 676f57f3530882252bba6338606ab8906a215b563335577e02c351c20fb632d1
generated_at: 2026-11-08T10:24:14.624019+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/runtime/shutdown-infra.test.ts

## Purpose

Verifies the **shutdown ordering** of `shutdownInfra` (from `server-lifecycle`). Every adapter is stubbed via `jest.mock`, so the test asserts only the *sequence* in which stores are closed and the caller's in-flight work is allowed to settle — not the internal behavior of any individual adapter.

## Key elements

- **`calls: string[]`** — module-level array that records stub invocations in order; reset in each `beforeEach`.
- **`beforeEach`** — resets `calls` and installs mock implementations on `stopQueue` and `stopDatabase` that push their respective labels into `calls`.
- **`describe('shutdownInfra')`** — two test cases:
  - *in-flight work settles first*: passes a `settleInFlight` callback (simulated with a 10 ms `setTimeout`) and asserts the order is `in-flight settled → queue stopped → database stopped`. Also asserts the callback receives a timeout number.
  - *no in-flight work*: calls `shutdownInfra()` with no callback and asserts the order is simply `queue stopped → database stopped`.

## Relationships

- **`src/infrastructure/runtime/server-lifecycle.ts`** — provides `shutdownInfra`, the function under test.
- **`src/infrastructure/adapters/queue.ts`** — provides `stopQueue`, mocked and asserted on for ordering.
- **`src/infrastructure/runtime/database.ts`** — provides `stopDatabase`, mocked and asserted on for ordering.
- Several other modules (`cache`, `pdf`, `limits-redis`, `i18n`, `analytics`, `otel-sdk`) are mocked as no-ops to isolate the sequence test from their side effects, but their call order is **not** asserted.

## Notes

- The test deliberately mocks *more* adapters than it asserts on. The extra mocks (cache, PDF, Redis, i18n, analytics, tracing) exist solely to prevent real side effects if `shutdownInfra` calls them internally; they are not part of the contract being verified.
- `settleInFlight` is expected to receive a numeric timeout argument (`expect.any(Number)`), implying `shutdownInfra` passes a wait-bounds value to the caller.
- Because all adapters are stubs, this test will pass even if an adapter's real `stop*` function throws or has different semantics — it is a pure sequencing guard.
