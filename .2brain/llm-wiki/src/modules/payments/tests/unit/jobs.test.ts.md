---
source: src/modules/payments/tests/unit/jobs.test.ts
sha256: c34ec51a0a3b00d1c8ca8a356899f50765dc028aed28bd4f3592c7de3b2648ad
generated_at: 2026-10-29T05:23:50.386767+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/tests/unit/jobs.test.ts

## Purpose

Unit test that verifies the `sweep:payment-effects` job's lease TTL is strictly greater than its 5-minute execution interval, ensuring a hung provider call cannot overlap with the next sweep and cause duplicate refund sends.

## Key elements

- **`describe('the payment-effects sweep')`** — Single test suite; the only assertion in the file.
- **Test: "runs under a lease longer than its 5-minute interval"** — Looks up the job by name in the `paymentsJobs` array and asserts `job.lease.ttlMs > 300_000`.

## Relationships

- **`src/modules/payments/jobs.ts`** — Source of the `paymentsJobs` array imported here. The test reads the `name` and `lease.ttlMs` fields of the entry it locates by name.

## Notes

- The test inspects a **static configuration value** (the job descriptor's lease TTL); it does not start, mock, or execute the job.
- The lookup uses optional chaining (`job?.lease?.ttlMs`), so a missing entry would cause the assertion to fail with an `undefined` comparison rather than throw.
- The 5-minute interval is the only assumption; if the interval changes, the constant `5 * 60_000` must be updated in lockstep.
