---
source: src/modules/delivery/jobs.ts
source_sha256: 40cde8e0c6bc4cad24c7e3d0792d918a3982db3242dc91b0c082b98e7e247904
context_sha256: 889e6270e6b8c1054259ea4c271193bf7e2bbc2552282eba0eb5dd82eae0ea53
generated_at: 2026-11-22T04:50:06.320175+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/delivery/jobs.ts

## Purpose
Declares the scheduled jobs owned by the `delivery` module: a job that scrubs hold and lost notes, and a daily preorder sweep. It builds the `JobDeclaration` list that the kernel registry consumes.

## Key elements
- `deliveryJobs: readonly JobDeclaration[]` is the only export. It contains two jobs:
  - **`reapDelivery`**: spreads `deliveryJobData.reapDelivery`. Its `run` calls `scrubHoldNotes()` and `scrubLostNotes()` in parallel and returns the sum of the two results.
  - **`sweepPreorders`**: spreads `deliveryJobData.sweepPreorders`. Its `run` calls `runPreorderSweep()` and logs `'Preorder sweep done.'` at info level with the sweep result fields. It also sets `lease: { ttlMs: 30 * MINUTE_MS }`.

## Relationships
- `src/kernel/registry.ts`: provides the `JobDeclaration` type that `deliveryJobs` must satisfy.
- `src/modules/delivery/services/retention.ts`: supplies `scrubHoldNotes` and `scrubLostNotes`.
- `src/modules/delivery/services/preorder-sweep.ts`: supplies `runPreorderSweep`.
- `src/infrastructure/adapters/logger.ts`: supplies the `logger` used to report the sweep result.
- `src/domain-primitives/time.ts`: supplies `MINUTE_MS` for the lease TTL.
- `src/modules/delivery/module.ts`: a graph neighbor. This file does not import it, so the link is presumably that the module wires `deliveryJobs` in. The file does not show this.

## Notes
- The base declaration for each job (`deliveryJobData`) comes from the sibling `./jobs.generated` module, not defined here. This file adds only `run` and, for the sweep, `lease`.
- The scrub job's `run` returns a number (holds + losses). The sweep's `run` returns nothing, since the result is only logged.
- Only the sweep job has a lease, with a 30-minute TTL. The scrub job declares none.
