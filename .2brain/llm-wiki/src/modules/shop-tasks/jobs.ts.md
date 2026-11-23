---
source: src/modules/shop-tasks/jobs.ts
source_sha256: 0a856bff8fe3db7546840370a3dc3c8c9603945226a9e8ff39c21bdd5ab181f9
context_sha256: 1f000f19248e81da8da5afc36912f92dd0fb3d7981d13cffdfaa0d1e77aa8fc7
generated_at: 2026-11-22T07:41:32.974440+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/shop-tasks/jobs.ts

## Purpose
Declares the scheduled jobs owned by the `shop-tasks` module: the daily and weekly staff digest. It combines per-job configuration generated from `module.yaml` with the digest-running logic, and exposes the result as a list of job declarations for the kernel to register.

## Key elements
- `digestJob(run, data)` (internal): builds a `JobDeclaration` from a `DigestRun` and a `JobData`. It spreads `data`, sets `run` to call `runStaffDigest(run)` and then logs `Staff <run> digest done.` with the result, and sets a lease with `ttlMs` of 30 minutes.
- `shopTasksJobs` (exported): a `readonly JobDeclaration[]` with two entries:
  - `'daily'`, using `shopTasksJobData.sweepStaffDigest`
  - `'weekly'`, using `shopTasksJobData.sweepStaffWeekly`

## Relationships
- `src/kernel/registry.ts`: provides the `JobDeclaration` type that this file's exports conform to.
- `src/infrastructure/config/shared-rules/jobs.ts`: provides the `JobData` type for the per-job config.
- `src/modules/shop-tasks/services/digest.ts`: provides `runStaffDigest` and the `DigestRun` type; the job body delegates all work to it.
- `src/infrastructure/adapters/logger.ts`: the `logger` is used to record completion of each run.
- `src/domain-primitives/time.ts`: `MINUTE_MS` is used to compute the lease TTL.
- `src/modules/shop-tasks/module.ts` is a graph neighbor. Nothing in this file shows how it uses `shopTasksJobs`.

## Notes
- Schedule and other job settings are not defined here. They come from `shopTasksJobData`, which is imported from `./jobs.generated` and is described in the source as coming from `module.yaml`. Because `...data` is spread first, `run` and `lease` set in `digestJob` take precedence over any same-named fields in that data.
- The 30-minute lease TTL is hardcoded and shared by both jobs.
