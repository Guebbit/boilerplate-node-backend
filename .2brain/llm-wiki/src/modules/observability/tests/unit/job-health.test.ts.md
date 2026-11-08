---
source: src/modules/observability/tests/unit/job-health.test.ts
sha256: a48ad215a06e8e87f254c2ab9a08ee14d78de795520491a44c34c375b450962b
generated_at: 2026-11-08T06:43:20.178602+00:00
model: ollama:qwen3.8:27b
---

# src/modules/observability/tests/unit/job-health.test.ts

## Purpose

Unit test for the `jobHealth` service function (the job half of `GET /observability/health`). Its sole job is to guarantee the **wire-shape contract**: `lastSuccessAt` must leave the function as an ISO-8601 string, not a `Date`, even though `JSON.stringify` would mask the difference. It also pins down the handling of absent timestamps and errors.

## Key elements

- **`listLeaseSummariesMock`** – a `jest.fn()` used to stub the lease-persistence layer so the test focuses purely on the shape transformation performed by `jobHealth`.
- **`jest.mock('@infrastructure/persistence/lease', …)`** – module-level mock that swaps `listLeaseSummaries` for the above.
- **Test: "reports a completed job as an ISO-8601 string, not a Date"** – asserts `lastSuccessAt` is the string `'2026-09-13T02:15:00.000Z'`, not a `Date` instance.
- **Test: "carries the last error through untouched"** – asserts `lastError` passes through as-is.
- **Test: "leaves a job that has never succeeded without a timestamp"** – asserts `lastSuccessAt` is `undefined` rather than a fabricated epoch value.
- **Test: "answers with an empty list"** – asserts an empty array in, empty array out.

## Relationships

- **`src/modules/observability/services/job-health.ts`** – the sole SUT; the test imports and calls its exported `jobHealth` function.
- **`@infrastructure/persistence/lease`** – mocked out; the real implementation is exercised by the lease module's own test suite.

## Notes

- The mock factory references `listLeaseSummariesMock` declared in module scope. Jest hoists the `jest.mock` call above the import, so the variable is available at call time despite the declaration appearing first in the file.
- The central risk this file guards: a `Date` and its ISO string are **indistinguishable after `JSON.stringify`**, so a passing HTTP contract test would not catch a regression here. The test asserts the JS value type directly.
- `lastSuccessAt` is deliberately optional in the output contract; the test enforces that a job with no prior success yields `undefined`, not `new Date(0)`.
