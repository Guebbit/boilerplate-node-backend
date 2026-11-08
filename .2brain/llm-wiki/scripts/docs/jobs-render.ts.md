---
source: scripts/docs/jobs-render.ts
sha256: 49187278a555d0c550ac8cf05bb350f86dd0925ac23be5b0a2820c94d2cd2467
generated_at: 2026-11-08T02:48:57.636165+00:00
model: ollama:qwen3.8:27b
---

# scripts/docs/jobs-render.ts

## Purpose

Pure rendering helpers that turn an array of `JobDeclaration` objects into two text artifacts: the `docker/crontab` file and the Markdown table shown on the ops page. Kept free of I/O so tests can assert on the rendered string in isolation; the sibling `generate-jobs.ts` handles the actual file writes.

## Key elements

- **`looksLikeCron(schedule)`** — shape-checks that a schedule has exactly 5 whitespace-separated fields. Not a cron parser; supercronic handles real validation at boot.
- **`describeSchedule(schedule)`** — renders a human-readable label for the ops table ("every minute", "every N min", "02:05 nightly") or falls back to the raw expression in backticks.
- **`renderCrontab(jobs)`** — returns the full `docker/crontab` text: a static explanatory header followed by one commented entry per job in declaration order.
- **`renderJobsTable(jobs)`** — returns a 4-column Markdown table (Job, Schedule, Leased, What it does), one row per job.
- **`RUNNER`** (`npm run job`) — the human-facing command shown in the table.
- **`CRON_RUNNER`** (`node --import tsx scripts/ops/run-job.ts`) — the command cron actually executes; uses `node` directly because the production image has no npm.
- **`CRONTAB_HEADER`** — the static multi-line comment block prepended to every generated crontab file.

## Relationships

- **`src/kernel/registry.ts`** — provides the `JobDeclaration` type imported by this module.
- **`scripts/docs/generate-jobs.ts`** — the sole caller in production: imports the render functions, assembles the full output, and writes it to disk.
- **`tests/unit/scripts/docs/jobs-render.test.ts`** — unit-tests the four exports against fixture declarations.
- **`tests/cross-cutting/scheduled-jobs.test.ts`** — integration-level test that checks the rendered output is consistent with what the registry actually declares.

## Notes

- This module is deliberately **pure** (no `fs`, no `process`). If a test needs to verify rendered text, it calls these functions directly rather than reading a file.
- The crontab entries are prefixed with `#` (a comment line) containing the job summary, so supercronic's output stays readable; the actual cron line follows on the next line.
- `describeSchedule` handles only three specific patterns; any other valid cron expression is displayed verbatim in backticks. It is not meant to be a general cron translator.
- The 5-field cron constraint is enforced by `looksLikeCron` but is not used inside `renderCrontab` itself — it is a validation helper callers (or tests) can apply before rendering.
