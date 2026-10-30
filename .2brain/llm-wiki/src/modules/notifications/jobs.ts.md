---
source: src/modules/notifications/jobs.ts
sha256: d8d47123ef035e4c98f8126e928e57056f0853f2e25e21a5c7466b47ba291258
generated_at: 2026-10-29T04:28:44.666537+00:00
model: ollama:qwen3.8:27b
---

# src/modules/notifications/jobs.ts

## Purpose

Declares the scheduled jobs the `notifications` module owns — the daily and weekly staff digest. It wires each job's execution to `runStaffDigest`, attaches logging, and exposes the result as a `JobDeclaration` array for the kernel's job registry.

## Key elements

- **`digestJob(run, data)`** (private) – Factory that builds a single `JobDeclaration` for a given digest variant (`'daily'` | `'weekly'`). Sets the `run` callback (calls `runStaffDigest`, then logs the outcome), marks `needs: { i18n: true }`, and sets a 30-minute lease TTL.
- **`notificationsJobs`** (exported, `readonly JobDeclaration[]`) – The module's job list: one entry for the daily digest and one for the weekly digest, each hydrated with data from the generated `notificationsJobData`.

## Relationships

- **`src/kernel/registry.ts`** – Provides the `JobDeclaration` type that shapes every entry in `notificationsJobs`.
- **`src/infrastructure/config/shared-rules/jobs.ts`** – Provides the `JobData` type consumed by `digestJob`.
- **`src/infrastructure/adapters/logger.ts`** – `logger.info` is called inside each job's `run` to record completion and the digest result.
- **`src/modules/notifications/jobs.generated.ts`** – Supplies `notificationsJobData` (sweep configs generated from `module.yaml`), giving each job its schedule/parameters.
- **`src/modules/notifications/services/digest.ts`** – `runStaffDigest` and the `DigestRun` union type are the actual work each job performs.
- **`src/modules/notifications/module.ts`** – Consumes the `notificationsJobs` export to register the jobs with the kernel.

## Notes

- `needs: { i18n: true }` is present because rendering the digest email requires translation strings; the underlying data rows do **not** require subscription lookups.
- The 30-minute lease (`lease.ttlMs`) guards against a stuck worker holding the job slot indefinitely.
- Job parameters (cron, scope, etc.) live in `module.yaml` and are surfaced here through the generated file — edit `module.yaml`, not this file, to change scheduling.
