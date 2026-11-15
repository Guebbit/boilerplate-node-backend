---
source: src/modules/shop-tasks/jobs.ts
sha256: 47c2f1825c0ad829ad43c31d6da1ca6751130409f15408582ee076eb829687fb
generated_at: 2026-11-14T21:50:48.346802+00:00
model: ollama:qwen3.8:27b
---

# src/modules/shop-tasks/jobs.ts

## Purpose

Declares the two scheduled jobs the `shop-tasks` module owns — the **daily** and **weekly** staff digest. Each job is a thin `JobDeclaration` that delegates execution to the shared `runStaffDigest` service and sets a fixed lease TTL.

## Key elements

- **`digestJob(run: DigestRun, data: JobData): JobDeclaration`** — Factory that merges the YAML-sourced `JobData` with a `run` closure (calls `runStaffDigest(run)` then logs the result) and a 30-minute lease.
- **`shopTasksJobs: readonly JobDeclaration[]`** — The module's full job list; exports the two instances created via `digestJob` (`'daily'` and `'weekly'`).

## Relationships

- **`src/kernel/registry.ts`** — Supplies the `JobDeclaration` interface that every entry in `shopTasksJobs` conforms to.
- **`src/infrastructure/config/shared-rules/jobs.ts`** — Supplies the `JobData` type used as the `data` parameter in `digestJob`.
- **`src/modules/shop-tasks/services/digest.ts`** — Provides `runStaffDigest` (the actual work) and the `DigestRun` discriminant type (`'daily' | 'weekly'`).
- **`src/infrastructure/adapters/logger.ts`** — Used inside the job `run` closure to emit an `info` line on successful completion.
- **`src/domain-primitives/time.ts`** — Supplies `MINUTE_MS`, used to compute the 30-minute lease TTL.
- **`src/modules/shop-tasks/module.ts`** — Parent module that registers `shopTasksJobs` with the runtime (consumed at module bootstrap).

## Notes

- The job metadata (`name`, `schedule`, etc.) is **not** authored here — it is pulled from a generated file (`./jobs.generated`) produced from the module's `module.yaml`. Edit the YAML (and regenerate) rather than hard-coding values in this file.
- Both jobs share a single factory, so any change to lease duration or logging format applies to both the daily and the weekly digest simultaneously.
- The `run` closure does not catch or log errors; failure handling is expected to be handled by the registry/runner layer that consumes `JobDeclaration`.
