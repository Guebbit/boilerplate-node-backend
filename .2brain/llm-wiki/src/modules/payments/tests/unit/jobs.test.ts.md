---
source: src/modules/payments/tests/unit/jobs.test.ts
sha256: c34ec51a0a3b00d1c8ca8a356899f50765dc028aed28bd4f3592c7de3b2648ad
generated_at: 2026-11-08T07:39:53.511625+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/tests/unit/jobs.test.ts

## Purpose

Unit test that guards the lease configuration of the `sweep:payment-effects` job, ensuring its TTL is strictly longer than the 5-minute sweep interval so a hung provider call cannot cause a second pass to resend the same refund keys.

## Key elements

- **`describe('the payment-effects sweep')`** — the single test suite in this file.
- **`it('runs under a lease longer than its 5-minute interval')`** — looks up the job named `sweep:payment-effects` in the `paymentsJobs` array and asserts `job.lease.ttlMs > 5 * 60_000`.

## Relationships

- **`src/modules/payments/jobs.ts`** — provides the `paymentsJobs` array (the single import in this file). The test reads the `name` and `lease.ttlMs` fields of the `sweep:payment-effects` entry.

## Notes

- The test is intentionally minimal (one assertion) because it guards a single invariant: lease TTL > sweep interval. If the interval constant changes elsewhere, this test must be updated to match.
- The lookup uses `find` on `name`, so renaming the job in `jobs.ts` without updating this test will cause a silent pass (the `job` will be `undefined` and `job?.lease?.ttlMs` will be `undefined`, which is **not** greater than 300 000 — so it actually *fails*). Still, a rename will produce a confusing assertion error rather than a compile-time one.
