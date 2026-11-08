---
source: src/modules/shop-tasks/jobs.ts
sha256: a240031aafe99b0a5ea4b322c77cca9be0ba871f054935b1a8229a01a6198f7e
generated_at: 2026-11-08T08:15:00.928797+00:00
model: ollama:qwen3.8:27b
---

# src/modules/shop-tasks/jobs.ts

## Purpose
Declares the two scheduled jobs owned by the `shop-tasks` module — the daily and weekly staff digest — by wrapping the shared `runStaffDigest` service into `JobDeclaration` objects ready for kernel registration.

## Key elements
- **`digestJob(run, data)`** (internal) — Factory that builds a single `JobDeclaration` from a `DigestRun` label and a `JobData` record. Wires up the `run` callback (calls `runStaffDigest`, then logs the result), sets `needs: { i18n: true }`, and assigns a 30-minute lease TTL.
- **`shopTasksJobs`** (exported, `readonly JobDeclaration[]`) — The two job declarations (`'daily'` and `'weekly'`) consumed by the module's registration. Job metadata (schedules, names) is sourced from `shopTasksJobData` in `./jobs.generated`.

## Relationships
- **`@kernel/registry`** — Imports the `JobDeclaration` type that shapes every entry in `shopTasksJobs`.
- **`@infrastructure/config/shared-rules/jobs`** — Imports the `JobData` type (schema for the generated job metadata).
- **`./services/digest`** — Calls `runStaffDigest(run)` inside each job's `run` callback; imports the `DigestRun` type for the `'daily' | 'weekly'` discriminator.
- **`./jobs.generated`** — Pulls `shopTasksJobData.sweepStaffDigest` and `.sweepStaffWeekly` as the static `JobData` payloads.
- **`@infrastructure/adapters/logger`** — Logs an info line after each successful digest run.
- **`@domain-primitives/time`** — Uses `MINUTE_MS` to express the lease TTL (30 min).
- **`module.ts`** (same folder) — Expected consumer that registers `shopTasksJobs` with the kernel on module boot.

## Notes
- `needs: { i18n: true }` is set on every digest job because rendering the mail body requires loaded translations; the rows themselves do **not** need subscriptions (see inline comment).
- The lease TTL is hardcoded to `30 * MINUTE_MS`. If digest execution ever approaches that window, the job will be re-scheduled rather than allowed to overlap.
- `shopTasksJobData` comes from a **generated** file (`./jobs.generated`), likely produced from `module.yaml`. Don't edit it by hand.
