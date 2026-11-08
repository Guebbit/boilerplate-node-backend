---
source: scripts/docs/generate-jobs.ts
sha256: 725971f786cd14994c62dc0e5db1f4ed38cce8e9ae5313a8b07bca714b81cd42
generated_at: 2026-11-08T02:47:39.395244+00:00
model: ollama:qwen3.8:27b
---

# scripts/docs/generate-jobs.ts

## Purpose

Generates two derived artifacts from job declarations — the `docker/crontab` file and the jobs table inside `docs/reference/ops.md` — as a step of `npm run regenerate`. In `--check` mode it reports drift instead of writing, which is what `npm run check` invokes. It exists so that a schedule declared once in code is never left stale in the files that actually schedule it.

## Key elements

- **`jobs`** (const) — Ordered list of all jobs: `appJobs` first, then jobs resolved from each enabled module via `resolveJobs(enabledModules)`.
- **`CRONTAB`** (const) — Repo-relative path `'docker/crontab'`, the whole-file rewrite target.
- **`settle(relative, expected, current)`** — Compares expected vs. current content. In check mode it logs drift and returns `1`; otherwise it writes the file and returns `0`.
- **`main()`** — Reads the existing crontab, calls `settle` with `renderCrontab(jobs)`, then calls `applyMarkerBlocks` on `docs/reference/ops.md` with a `<!-- jobs:start/end -->` block containing `renderJobsTable(jobs)`. Returns a single exit code (0 or 1).
- **`checkOnly`** — Boolean from `hasFlag('check')`; gates write-vs-report behavior across both targets.
- **Script entry** — `main().then(set process.exitCode).catch(failScript)`.

## Relationships

- **`src/app/jobs.ts`** — Supplies `appJobs`, the jobs no module owns.
- **`src/modules.ts`** — Supplies `enabledModules`, the module set whose jobs are included.
- **`src/kernel/registry.ts`** — `resolveJobs` extracts the declared jobs from each enabled module.
- **`scripts/docs/jobs-render.ts`** — Provides `renderCrontab` (whole-file text) and `renderJobsTable` (Markdown table for the ops page).
- **`scripts/docs/marker-block.ts`** — `applyMarkerBlocks` updates only the delimited region in `docs/reference/ops.md` without touching surrounding content.
- **`scripts/modules-on-disk.ts`** — Provides `REPO_ROOT` (aliased `ROOT`) for all file-system paths.
- **`scripts/cli.ts`** — `hasFlag('check')` parses the `--check` flag.
- **`scripts/fail-script.ts`** — `failScript` is the unhandled-rejection handler that prints a useful error and exits non-zero.

## Notes

- The crontab is rewritten **whole** (no marker blocks); the ops.md table uses marker blocks so other content in that file is preserved.
- Job order is significant: app-level jobs precede module jobs, and this order is what appears in both the crontab and the table.
- The script is a `tsx` shebang script (`#!/usr/bin/env tsx`), not a compiled build artifact.
