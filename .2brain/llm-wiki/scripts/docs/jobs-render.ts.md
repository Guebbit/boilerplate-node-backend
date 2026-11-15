---
source: scripts/docs/jobs-render.ts
sha256: d2bc86448f1a587e8bb938880999c0bb8e7f2761d70d47dbb60dca917a02290a
generated_at: 2026-11-14T17:33:53.976034+00:00
model: ollama:qwen3.8:27b
---

# scripts/docs/jobs-render.ts

## Purpose

Pure rendering functions that turn `JobDeclaration` objects into their two textual outputs: the `docker/crontab` entries consumed by supercronic and the Markdown jobs table on the ops page. Exists as a separate module from `generate-jobs.ts` so the string-shaping logic can be tested without disk I/O.

## Key elements

- **`looksLikeCron(schedule)`** — Shape check that a schedule string has exactly 5 whitespace-separated fields. Not a parser; supercronic enforces actual grammar at boot.
- **`describeSchedule(schedule)`** — Translates a cron expression into a short human phrase for the ops table (`"02:05 nightly"`, `"every 5 min"`, `"every minute"`). Falls back to showing the raw expression in backticks.
- **`renderCrontab(jobs)`** — Returns the complete `docker/crontab` file content: a fixed comment header followed by one two-line entry per job (a `# summary` comment line above the actual `schedule cd /app && node --import tsx scripts/ops/run-job.ts <name>` line).
- **`renderJobsTable(jobs)`** — Returns a Markdown table (Job / Schedule / Leased / What it does) with one row per job, in declaration order.
- **`RUNNER`** (`npm run job`) — Command shown in the ops table for manual execution.
- **`CRON_RUNNER`** (`node --import tsx scripts/ops/run-job.ts`) — Command used inside the crontab; the production image has no npm, so it invokes Node directly with `--import tsx`.
- **`CRONTAB_HEADER`** — The static comment block explaining provenance, safety, and log passthrough for the generated crontab.

## Relationships

- **`src/kernel/registry.ts`** — Provides the `JobDeclaration` type that all exported functions accept.
- **`scripts/docs/generate-jobs.ts`** — The sole consumer in production; calls `renderCrontab` and `renderJobsTable` and writes the results to disk.
- **`tests/unit/scripts/docs/jobs-render.test.ts`** — Unit-tests the pure output strings against fixture declarations.
- **`tests/cross-cutting/scheduled-jobs.test.ts`** — Exercises the rendered crontab table together with the rest of the pipeline.

## Notes

- This module performs **no I/O** and has no side effects; all output is returned as strings.
- `describeSchedule` handles only three specific patterns (all-star, step-in-minute, fixed hour+minute); every other expression is emitted verbatim in backticks.
- The crontab entries use `cd /app &&` so the `--import tsx` specifier resolves relative to the project root regardless of the cron working directory.
- Job order in both outputs mirrors declaration order — there is no sorting here.
