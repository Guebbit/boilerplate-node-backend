---
source: src/modules/observability/tests/unit/parked-jobs.test.ts
sha256: 6aebdc857a4afa4c1562545785eef78effa464acc2b7f78dc65cd90c74459cd2
generated_at: 2026-11-08T06:44:11.492346+00:00
model: ollama:qwen3.8:27b
---

# src/modules/observability/tests/unit/parked-jobs.test.ts

## Purpose

Unit test for `queueHealth`, the queue half of `GET /observability/health`. It verifies that `queueHealth` is a faithful pass-through of `parkedCounts()`—no transformation, no filtering—by mocking the queue adapter and asserting the returned array is unchanged.

## Key elements

- **`parkedCountsMock`** — `jest.fn()` stand-in for the real `parkedCounts` function; each test sets `mockResolvedValue` to a fixed array.
- **`jest.mock('@infrastructure/adapters/queue')`** — replaces the queue adapter module so no real broker call is made.
- **`queueHealth`** — the service under test, imported from `../../services/parked-jobs`.
- **Test 1: "reports every queue parkedCounts answers with, unchanged"** — asserts a non-empty result (two queues with differing `parked` counts) round-trips exactly.
- **Test 2: "answers empty when parkedCounts reaches no queue at all"** — asserts that an empty array from `parkedCounts` propagates as `[]`.

## Relationships

- **`src/modules/observability/services/parked-jobs.ts`** — the module under test. `queueHealth` is imported from here; the test confirms it delegates to (and does not reshape the output of) `parkedCounts` from the queue adapter.

## Notes

- Scope is intentionally narrow: this file tests only the wiring. The broker-level behavior of `parkedCounts` (channel open, broker calls) is covered in `tests/unit/infrastructure/adapters/queue.test.ts`.
- The wire shape `ObservabilityHealth.queues` is identical to `parkedCounts`'s return type, so there is no mapping step to test—unlike the `jobHealth` sibling which does Date-to-string conversion.
