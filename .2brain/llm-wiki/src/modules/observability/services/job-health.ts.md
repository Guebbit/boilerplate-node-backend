---
source: src/modules/observability/services/job-health.ts
source_sha256: 1d7585e8db60d816b7eab741a1cdfd758dffc77ba99395950fef687fd42f2369
context_sha256: fa4131f51a9e128aebfd65aaa840e5762b881029bd826ddcb8390c78ccaed85d
generated_at: 2026-11-22T06:03:24.310826+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/observability/services/job-health.ts

## Purpose
Provides the job half of `GET /observability/health`: the last observed outcome of every crontab job, read from each job's `leases` document. Unlike `dependency-health.ts`, it performs I/O (one `leases` query), because no in-process copy exists of when a job last finished or whether it succeeded.

## Key elements
- `jobHealth()` — returns `Promise<ObservabilityHealthJob[]>`. Calls `listLeaseSummaries()` and maps each summary to `{ name, lastSuccessAt, lastError }`, with `lastSuccessAt` converted to an ISO-8601 string via optional chaining (so it is absent when the summary has no `lastSuccessAt`).

## Relationships
- `src/infrastructure/persistence/lease.ts` — supplies `listLeaseSummaries()`, the only data source.
- `src/types/index.ts` — supplies the `ObservabilityHealthJob` wire type.
- `src/modules/observability/services/health.ts` — neighbor in the graph. This file's output is the job half of the health endpoint, so it likely consumes this function, but that isn't visible here.
- `src/modules/observability/services/index.ts` — neighbor in the graph, likely the services barrel; the re-export isn't visible in this file.
- `src/modules/observability/tests/unit/job-health.test.ts` — unit test for this function.

## Notes
- Lease documents are written by `scripts/run-script.ts` for every job; the one job also wrapped in `withLease` is additionally written by that.
- Dates are ISO strings to match the other timestamps this endpoint reports.
- The file's header points to the scheduled-jobs section of the ops reference docs for job context.
