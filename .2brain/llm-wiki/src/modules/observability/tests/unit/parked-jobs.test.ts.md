---
source: src/modules/observability/tests/unit/parked-jobs.test.ts
sha256: 6aebdc857a4afa4c1562545785eef78effa464acc2b7f78dc65cd90c74459cd2
generated_at: 2026-09-23T18:58:52.060525+00:00
model: ollama:qwen3.8:27b
---

# src/modules/observability/tests/unit/parked-jobs.test.ts

## Purpose

Unit test for the `queueHealth` function (the queue half of `GET /observability/health`). It verifies that `queueHealth` is a thin pass-through of `parkedCounts()` with no shape transformation, covering both populated and empty results.

## Key elements

- **`parkedCountsMock`** – A `jest.fn()` that stands in for the real `parkedCounts` adapter call, allowing each test to control the resolved value.
- **`jest.mock('@infrastructure/adapters/queue', …)`** – Module-level mock that replaces `parkedCounts` with a factory calling `parkedCountsMock()`, isolating the service under test from its broker I/O.
- **`describe('queueHealth')`** – Two cases:
    - _reports every queue parkedCounts answers with, unchanged_ – asserts the array of `{ name, parked }` objects arrives verbatim (no Date-to-string mapping, no reordering).
    - _answers empty when parkedCounts reaches no queue at all_ – asserts an empty array is passed through.

## Relationships

- **Imports** `queueHealth` from `src/modules/observability/services/parked-jobs.ts` — the sole production code under test.
- **Mocks** `@infrastructure/adapters/queue` (the internal dependency of `parked-jobs.ts`), so no real broker or channel is opened during the test. The full `parkedCounts` implementation is exercised separately in `tests/unit/infrastructure/adapters/queue.test.ts`.

## Notes

- By design this file does **not** test `parkedCounts` behavior (channel setup, broker calls). Its scope is strictly the wiring: that `queueHealth` delegates to `parkedCounts` and returns the result unmodified.
- Unlike the sibling `jobHealth` service, `queueHealth` performs no `Date → string` mapping; the wire shape in `ObservabilityHealth.queues` matches `parkedCounts`'s return type directly.
