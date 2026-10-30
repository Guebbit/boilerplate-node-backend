---
source: tests/cross-cutting/scheduled-jobs.test.ts
sha256: 461165f545a6e62845b938cf707563a4c4056009167c1f16d2b3e68aa5ae4606
generated_at: 2026-10-29T06:49:49.405105+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/scheduled-jobs.test.ts

## Purpose

Cross-cutting guard that every scheduled job in the build is declared exactly once, follows the naming/schedule/summary conventions the generators assume, and reaches the production image through a single runner. Replaces the old "two files must agree" checks now that `docker/crontab` and the ops jobs table are generated from the declarations (`npm run regenerate` / `npm run check`).

## Key elements

- **`JOBS`** (module-level const) — `[...appJobs, ...resolveJobs(enabledModules)]`, the full job list in crontab order.
- **`describe('the declared jobs')`**
  - *Canary count* — asserts `JOBS.length >= 8` to catch a silent registry loss, not to pin an exact total.
  - *Unique names* — all `job.name` values must be distinct.
  - *Well-formed (per job, via `it.each`)* — name matches `^(?:reap|sweep):[\w-]+$`, `job.schedule` passes `looksLikeCron`, `job.summary` is > 10 chars.
  - *Lease TTL (per job with a lease)* — `job.lease.ttlMs > 0`.
- **`describe('every scheduled job ships in the production image')`**
  - Asserts `package.json` → `scripts.job` equals `'tsx scripts/ops/run-job.ts'`.
  - Reads `docker/crontab`, confirms no entry invokes `npm`, and that the runner is invoked as `node --import tsx scripts/ops/run-job.ts`.

## Relationships

- **`src/app/jobs.ts`** — source of `appJobs`, the foundation-level job declarations that are not owned by any module.
- **`src/kernel/registry.ts`** — `resolveJobs` pulls the job list out of each enabled module's manifest.
- **`src/modules.ts`** — `enabledModules` determines *which* modules contribute jobs to `JOBS`.
- **`scripts/docs/jobs-render.ts`** — provides `looksLikeCron`, the shared five-field-cron validator also used by the docs generator.
- **`tests/support/paths.ts`** — `REPO_ROOT` is used to locate `package.json` and `docker/crontab` on disk.

## Notes

- The canary floor (≥ 8) is deliberately low; it exists only to fail loudly if the registry import silently returns an empty array, not to encode a real count.
- `looksLikeCron` is imported from a docs-generation script rather than a shared utility module — a deliberate single-source-of-truth for cron validation, but it means changes to the docs script can affect this test.
- The crontab check reads a **generated** file (`docker/crontab`), not the source declarations. If the file is missing or stale the test fails; running `npm run regenerate` restores it.
- Lease validation only applies to jobs that actually define a `lease` property; jobs without one are skipped entirely.
