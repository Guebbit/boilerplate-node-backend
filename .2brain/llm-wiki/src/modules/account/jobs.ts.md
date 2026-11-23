---
source: src/modules/account/jobs.ts
source_sha256: d0d29db76e0ef40944c1f2d0fa48ecd0cca6146d335bd3d864aab315c8eb8188
context_sha256: 7fd277047383fa653e7ae10d8479368a78346451e19145c3bed52496c82b0817
generated_at: 2026-11-22T03:30:04.480379+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/jobs.ts

## Purpose
Declares the scheduled jobs owned by the `account` module: the inactivity reaper, the previous-email sweep, the expired-export sweep, and the purge of accounts whose self-deletion grace period has expired. It wires job metadata and service functions into `JobDeclaration` entries for the kernel registry.

## Key elements
- `accountJobs` (exported): a `readonly JobDeclaration[]` with four jobs, in order:
  1. `reapInactiveAccounts`: runs `reapInactive`. It has a lease with a 15 minute TTL.
  2. `reapPreviousEmails`: runs `reapLapsedPreviousEmails`, logs the count cleared, and returns `{ cleared }`. It has a lease with a 30 minute TTL.
  3. `reapAccountExports`: runs `reapExpiredExports`, logs the rows and stray files, and returns `{ rows, files }`. It has no lease.
  4. `reapScheduledDeletions`: runs `purgeScheduledDeletions`. It has a lease with a 15 minute TTL.
- `reapInactive` (internal): reads `NODE_INACTIVE_ACCOUNT_DAYS` and `NODE_INACTIVE_MINIMISE_DAYS` from `accountConfig()`. If both are `<= 0`, it logs that the reaper is disabled and returns zero counts (`minimised`, `warned`, `softDeleted`, `hardDeleted`). Otherwise it calls `reapInactiveAccounts({ inactiveDays, minimiseDays })`.

## Relationships
- `src/kernel/registry.ts`: provides the `JobDeclaration` type that `accountJobs` conforms to.
- `src/modules/account/config.ts`: `accountConfig()` supplies the inactivity and minimise day settings.
- `src/modules/account/services/reap-inactive.ts`, `previous-email-cleanup.ts`, `export-rows.ts` and `purge-deletions.ts`: the service functions that do the work for each job.
- `src/infrastructure/adapters/logger.ts`: used for the disabled notice and for the result logs of the email and export sweeps.
- `src/domain-primitives/time.ts`: `MINUTE_MS`, used to compute lease TTLs.
- `src/modules/account/tests/integration/jobs.test.ts`: the integration test for these jobs.
- `src/modules/account/module.ts` is a graph neighbor, but this file does not reference it.

## Notes
- Per the inline comments, the two jobs that hard-delete accounts are leased, so only one runner executes them at a time. The export sweep declares no lease.
- Each job spreads in declaration data from `accountJobData` (imported from `./jobs.generated`), and this file only adds `run` and `lease`. The schedules themselves live in that generated data, which isn't shown here.
- The module doc says the nightly sweeps run in the listed order, followed by the hourly purge.
- Setting both inactivity dials to 0 disables the reaper entirely. If only one is 0, the job still runs and passes both values to the service.
- The module doc points to an ops reference on scheduled jobs.
