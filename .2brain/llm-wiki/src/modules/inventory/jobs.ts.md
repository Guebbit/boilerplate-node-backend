---
source: src/modules/inventory/jobs.ts
sha256: 40ccf31cbb9d368953a797822808b960dece11a9afd038c4bf3714557cc834ea
generated_at: 2026-11-14T20:03:30.984457+00:00
model: ollama:qwen3.8:27b
---

# src/modules/inventory/jobs.ts

## Purpose

Declares the single scheduled job owned by the `inventory` module — the stale-hold (reservation) sweep — as a `JobDeclaration` array consumed by the kernel's job scheduler.

## Key elements

- **`inventoryJobs: readonly JobDeclaration[]`** — the sole export. Contains one entry that wires the `sweepReservations` job data (from the generated `jobs.generated` module) to a concrete `run` callback calling `runReservationSweep()`.
- **`lease.ttlMs: 10 * MINUTE_MS`** — the job's lease is set to 10 minutes, deliberately longer than the 5-minute scheduler tick and longer than a worst-case drain of 10,000 holds, to prevent two concurrent drains from racing over the same claims.

## Relationships

- **`src/kernel/registry.ts`** — supplies the `JobDeclaration` type that shapes each entry in `inventoryJobs`.
- **`src/domain-primitives/time.ts`** — provides the `MINUTE_MS` constant used to compute the lease TTL.
- **`src/modules/inventory/services/sweep.ts`** — provides `runReservationSweep`, the actual work executed when the job fires.
- **`src/modules/inventory/module.ts`** — the module entry point that registers `inventoryJobs` with the kernel (this file is the job-declaration source it imports).

## Notes

- Job metadata (name, schedule cadence, etc.) is *not* written here; it comes from `inventoryJobData.sweepReservations` in the generated file. Only the `run` handler and lease TTL are specified in this file.
- The lease is intentionally **not** aligned to the tick interval — it is sized to the operation's worst-case duration to avoid mid-drain preemption or overlap.
