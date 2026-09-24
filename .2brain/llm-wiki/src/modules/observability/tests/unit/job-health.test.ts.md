---
source: src/modules/observability/tests/unit/job-health.test.ts
sha256: a48ad215a06e8e87f254c2ab9a08ee14d78de795520491a44c34c375b450962b
generated_at: 2026-09-23T18:58:25.098984+00:00
model: ollama:qwen3.8:27b
---

# src/modules/observability/tests/unit/job-health.test.ts

## Purpose

Unit tests for the `jobHealth` service that back the jobs half of `GET /observability/health`. The entire suite guards one wire-shape contract: `lastSuccessAt` must be an ISO-8601 **string** in the response, not a `Date` object. Because `JSON.stringify` produces identical output for both, the failure would be invisible to a passing contract test and only surface when a consumer reads the field directly.

## Key elements

- **`listLeaseSummariesMock`** – a `jest.fn()` that replaces `listLeaseSummaries` from `@infrastructure/persistence/lease` via `jest.mock`. Isolates the mapping logic from any Mongo query behaviour.
- **`describe('jobHealth')`** – four cases:
  - *ISO-8601 string, not a Date* – asserts `lastSuccessAt` is the string `'2026-09-13T02:15:00.000Z'`, not a `Date` instance.
  - *lastError passthrough* – verifies a non-null `lastError` string is carried through unmodified.
  - *Never-succeeded job* – asserts `lastSuccessAt` is `undefined` (not the epoch), guarding against `new Date(undefined)`.
  - *Empty lease list* – asserts the service returns `[]` rather than a single `null`/`undefined`.

## Relationships

- **`src/modules/observability/services/job-health.ts`** – the sole unit under test; `jobHealth` is imported and invoked in every case.
- **`@infrastructure/persistence/lease`** – mocked at the module level; the test never executes real persistence code.

## Notes

- The mock is declared **before** the `import` so `jest.mock` hoisting resolves the reference correctly.
- The "never succeeded" test exists specifically because the contract marks `lastSuccessAt` as optional; omitting it is intentional, not a missing field.
- `lastError` is expected to be `undefined` (not `null`) when absent, matching the service's omission pattern.
