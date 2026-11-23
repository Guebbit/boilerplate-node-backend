---
source: src/modules/payments/tests/unit/jobs.test.ts
source_sha256: c34ec51a0a3b00d1c8ca8a356899f50765dc028aed28bd4f3592c7de3b2648ad
context_sha256: 64bfbe0756568d109335a7fab3d651bfde3cebca54ad11d1fb19bb436daacedd
generated_at: 2026-11-22T07:05:26.039764+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/payments/tests/unit/jobs.test.ts

## Purpose
Unit test guarding a configuration invariant of the payments module's scheduled jobs: the `sweep:payment-effects` job must hold a lease that outlasts its run interval. The stated rationale (module doc comment) is that a hung provider call must not let a second pass start and resend the same refund keys.

## Key elements
- `describe('the payment-effects sweep')` containing a single test.
- Test `runs under a lease longer than its 5-minute interval`: looks up the job named `sweep:payment-effects` in `paymentsJobs` and asserts `job?.lease?.ttlMs` is greater than `5 * 60_000` (5 minutes in ms).

## Relationships
- Imports `paymentsJobs` from `src/modules/payments/jobs.ts` (via `../../jobs`) and looks up the `sweep:payment-effects` entry by its `name`. It only reads the job definition and does not execute the job.

## Notes
- The 5-minute interval is hardcoded in the test, not read from the job definition. If the job's interval changes, this threshold must be updated manually.
- If the job is missing or has no lease, `job?.lease?.ttlMs` is `undefined` and the assertion fails, so removing the lease or renaming the job also breaks this test.
