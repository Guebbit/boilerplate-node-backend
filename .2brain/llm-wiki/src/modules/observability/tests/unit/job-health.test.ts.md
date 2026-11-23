---
source: src/modules/observability/tests/unit/job-health.test.ts
source_sha256: a3291f6dddd528bde0d423f8b324cf128c9079ea3c3eb48e026f7c3a84ff6672
context_sha256: 4a09c2164558f9b61fd80999685a27277e672afce0f26575b665f089d69057f9
generated_at: 2026-11-22T06:05:19.187015+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/observability/tests/unit/job-health.test.ts

## Purpose
Unit tests for `jobHealth`, the job half of `GET /observability/health`. The suite guards a wire-shape guarantee: `leases` stores `lastSuccessAt` as a `Date`, while the `ObservabilityHealth.jobs` contract declares an ISO-8601 string, like every other timestamp that endpoint reports. A leaked `Date` serialises identically through `JSON.stringify`, so a contract test would still pass. The bug only shows up when something reads the field without going through JSON.

## Key elements
- `listLeaseSummariesMock`: a `jest.fn()` that stands in for `listLeaseSummaries` from `@infrastructure/persistence/lease`. It is registered through `jest.mock` and set per test with `mockResolvedValue`.
- Test: completed job. A `Date` `lastSuccessAt` comes out as an ISO string (`'2026-09-13T02:15:00.000Z'`). `lastError` is `undefined`.
- Test: last error. A `lastError` such as `'ECONNREFUSED'` passes through unchanged.
- Test: never-succeeded job. A summary with no `lastSuccessAt` yields `undefined` for that field. It does not yield an invented timestamp such as the epoch from `new Date(undefined)`.
- Test: no leases. An empty summary list gives `[]`.

## Relationships
- Imports `jobHealth` from `../../services/job-health` (`src/modules/observability/services/job-health.ts`), the code under test.
- Mocks `@infrastructure/persistence/lease`, so the Mongo read is outside this suite's scope. Per the file's own comment, that read belongs to the lease suite. These tests cover only the mapping applied afterwards.

## Notes
- The mock factory calls `listLeaseSummariesMock()` through an arrow function. This lets the `jest.fn` be declared above the hoisted `jest.mock` call and used inside it.
- `lastSuccessAt` is optional in the contract because a job can be registered but never run.
