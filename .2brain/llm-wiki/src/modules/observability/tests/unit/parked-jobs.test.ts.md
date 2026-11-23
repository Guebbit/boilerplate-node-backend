---
source: src/modules/observability/tests/unit/parked-jobs.test.ts
source_sha256: b88b441cd8e6b3c9a77fb105c90f026c14aa0616a4d7fbd37fa5a1012fc230d2
context_sha256: 257fd38a357d76aa204db73838cbf4a47169d15516c9f2328e0b81d890febd8e
generated_at: 2026-11-22T06:06:02.752065+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/observability/tests/unit/parked-jobs.test.ts

## Purpose
Unit tests for `queueHealth`, the queue half of `GET /observability/health`. They check that `queueHealth` passes the result of `parkedCounts()` straight through with no transformation. The behavior of `parkedCounts` itself (channel handling, broker calls) is tested elsewhere, in `tests/unit/infrastructure/adapters/queue.test.ts`. This file covers only the wiring.

## Key elements
- `parkedCountsMock`: a `jest.fn()` that stands in for `parkedCounts`. Each test sets its resolved value.
- `jest.mock('@infrastructure/adapters/queue', ...)`: replaces the queue adapter module with a `parkedCounts` that delegates to `parkedCountsMock`.
- Test "reports every queue parkedCounts answers with, unchanged": the mock resolves with `worker.email.send` (parked 2) and `worker.image.digest` (parked 0). `queueHealth()` is expected to resolve with the same array.
- Test "answers empty when parkedCounts reaches no queue at all": the mock resolves with `[]`. `queueHealth()` is expected to resolve with `[]`.

## Relationships
- Imports `queueHealth` from `../../services/parked-jobs` (`src/modules/observability/services/parked-jobs.ts`), the unit under test.
- Mocks `@infrastructure/adapters/queue`, the module that `queueHealth` calls `parkedCounts` from, so no real broker is touched.

## Notes
- `jest.mock` is declared before the `queueHealth` import so the mocked adapter is in place when the service loads.
- The header comment contrasts this with `jobHealth`, which maps Dates to strings. `queueHealth` needs no mapping, because the `ObservabilityHealth.queues` wire shape is exactly what `parkedCounts` returns.
