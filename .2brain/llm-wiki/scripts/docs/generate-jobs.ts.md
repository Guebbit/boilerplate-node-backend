---
source: scripts/docs/generate-jobs.ts
sha256: 725971f786cd14994c62dc0e5db1f4ed38cce8e9ae5313a8b07bca714b81cd42
generated_at: 2026-10-29T01:34:33.152979+00:00
model: ollama:qwen3.8:27b
---

# scripts/docs/generate-jobs.ts

## Purpose

Generates two artifacts from the job declarations in the codebase: the Docker crontab (`docker/crontab`) and the jobs table in `docs/reference/ops.md`. It runs as part of `npm run regenerate` (writes) and `npm run check` (`--check` flag; reports drift without writing). The rationale is that a hand-maintained schedule is one a person will miss, so the source of truth stays in code.

## Key elements

- **`checkOnly`** — Boolean from `hasFlag('check')`; switches the script from write-mode to drift-report mode.
- **`jobs`** — Combined array of `appJobs` (app-level, module-less jobs) and `resolveJobs(enabledModules)` (per-module jobs). This single list drives both output files.
- **`settle(relative, expected, current)`** — Compares expected content against what's on disk. In write-mode it overwrites the file; in check-mode it prints a drift message and returns 1. Returns an exit-code contribution.
- **`main()`** — Reads the existing crontab, calls `settle` for it, then calls `applyMarkerBlocks` to update the `<!-- jobs:start --> … <!-- jobs:end -->` section in `docs/reference/ops.md`. Returns 0 or 1 as the process exit code.

## Relationships

- **`src/app/jobs.ts`** — Imports `appJobs`, the app-level job definitions.
- **`src/modules.ts`** — Imports `enabledModules`, the list of active modules.
- **`src/kernel/registry.ts`** — Imports `resolveJobs`, which extracts each enabled module's declared jobs.
- **`scripts/docs/jobs-render.ts`** — Imports `renderCrontab` and `renderJobsTable`, the pure render functions that turn the `jobs` array into file content.
- **`scripts/docs/marker-block.ts`** — Imports `applyMarkerBlocks`, which performs the in-place replacement between HTML-comment markers (or reports drift in check-mode).
- **`scripts/modules-on-disk.ts`** — Imports `REPO_ROOT` for absolute path resolution.
- **`scripts/cli.ts`** — Imports `hasFlag` to read the `--check` flag.
- **`scripts/fail-script.ts`** — Imports `failScript`, used as the `.catch` handler to report unhandled errors.

## Notes

- The crontab is regenerated **whole** (full file replace); the ops.md table is updated **in-place** between marker comments. This asymmetry means the crontab must contain *only* generated content.
- In check-mode, `settle` and `applyMarkerBlocks` both report drift and return non-zero, but **no file is modified**.
- The exit code is binary: 0 if everything matches, 1 if any drift or write occurred and was flagged as mismatched.
