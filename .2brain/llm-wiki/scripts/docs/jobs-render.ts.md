---
source: scripts/docs/jobs-render.ts
sha256: 49187278a555d0c550ac8cf05bb350f86dd0925ac23be5b0a2820c94d2cd2467
generated_at: 2026-10-29T01:35:54.150263+00:00
model: ollama:qwen3.8:27b
---

# scripts/docs/jobs-render.ts

## Purpose

Pure rendering module that turns `JobDeclaration` objects into two artifacts: the text of `docker/crontab` and the Markdown table on the ops page. It exists so the text generation is testable without touching disk; `generate-jobs.ts` is the only file that actually writes.

## Key elements

- **`looksLikeCron(schedule)`** – Shape check: returns `true` if the trimmed string has exactly 5 whitespace-separated fields. Not a parser; supercronic does real validation at boot.
- **`describeSchedule(schedule)`** – Converts common cron patterns to a human-readable label (`"02:05 nightly"`, `"every 5 min"`, `"every minute"`). Falls back to the raw expression in backticks for anything else.
- **`renderCrontab(jobs)`** – Builds the full `docker/crontab` text: a multi-line header comment plus one `# summary` / `schedule cd /app && node --import tsx scripts/ops/run-job.ts <name>` pair per job, in declaration order.
- **`renderJobsTable(jobs)`** – Emits a 4-column Markdown table (`Job | Schedule (UTC) | Leased | What it does`), one row per job.
- **`RUNNER`** – `'npm run job'`; the human-facing invocation shown in the table.
- **`CRON_RUNNER`** – `'node --import tsx scripts/ops/run-job.ts'`; what cron actually executes inside the container (no npm available).
- **`CRONTAB_HEADER`** – Static comment block explaining provenance, log passthrough, and the regenerate workflow.

## Relationships

- **`src/kernel/registry.ts`** – Supplies the `JobDeclaration` type consumed by every render function.
- **`scripts/docs/generate-jobs.ts`** – The I/O caller; imports the render functions and writes their output to disk. This module does no file access.
- **`tests/unit/scripts/docs/jobs-render.test.ts`** – Unit-tests the pure output strings against known declarations.
- **`tests/cross-cutting/scheduled-jobs.test.ts`** – Exercises the full generate → render pipeline end-to-end.

## Notes

- **Two runners, one purpose.** `RUNNER` is for humans in the table; `CRON_RUNNER` is for the container. They point at the same script but the cron form avoids the npm dependency absent from the production image.
- **`describeSchedule` is intentionally narrow.** Only three patterns are recognised; everything else is rendered verbatim. Adding a new pattern is a safe change—unknown schedules already degrade gracefully.
- **No output redirects in the crontab.** The header comment notes that supercronic's `-passthrough-logs` flag handles stdout/stderr → container log → Promtail; adding `> /dev/null 2>&1` would break observability.
- **Deletion is implicit.** Removing a job's declaration from a module's manifest removes its crontab entry on the next `npm run regenerate`; there is no per-entry delete API.
