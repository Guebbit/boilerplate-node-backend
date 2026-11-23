---
source: scripts/docs/generate-jobs.ts
source_sha256: 62561948b6f8ec505ffb03db4687281d0ede405d3c7e2f3ecbd134aae19846cf
context_sha256: b452c94ca15866ce40b645037364dc5567d4c2d21950bcb6fef470ba446d23f1
generated_at: 2026-11-22T02:03:07.971517+00:00
model: claude-code:claude-sonnet-5-5
---

# scripts/docs/generate-jobs.ts

## Purpose
A `tsx` script, run as a step of `npm run regenerate`, that derives everything dependent on declared jobs: the `docker/crontab`, its Kubernetes copy `k8s/base/crontab`, and the jobs table in the ops reference page. Jobs are declared once and written to all three places, so a hand-kept schedule can't be missed. With `--check` it reports drift instead of writing, which is what `npm run check` runs.

## Key elements
- `checkOnly`: set from `hasFlag('check')`. It switches between writing files and reporting drift.
- `jobs`: `[...appJobs, ...resolveJobs(enabledModules)]`. These are the jobs no module owns, followed by each enabled module's jobs.
- `CRONTABS`: `['docker/crontab', 'k8s/base/crontab']`. Both are generated whole.
- `settle(relative, expected, current)`: returns 0 if the content matches. Otherwise, in check mode it prints an error ("Run: npm run regenerate") and returns 1. Otherwise it writes the file, logs `✓ Generated …`, and returns 0.
- `settleCrontab(relative)`: renders the crontab from `jobs`, reads the existing file (or `''` if missing), and passes both to `settle`.
- `main()`: settles both crontabs, then updates the `<!-- jobs:start -->` / `<!-- jobs:end -->` block in the ops reference page with the jobs table. It returns 0 or 1. The result is assigned to `process.exitCode`, and rejections go to `failScript`.

## Relationships
- `src/app/jobs.ts` supplies `appJobs`, the app-level jobs.
- `src/kernel/registry.ts` supplies `resolveJobs`, which collects jobs from the modules.
- `src/modules.ts` supplies `enabledModules`, the modules whose jobs are included.
- `scripts/docs/jobs-render.ts` supplies `renderCrontab` and `renderJobsTable`, which produce the file content.
- `scripts/docs/marker-block.ts` supplies `applyMarkerBlocks`, which handles the marker-delimited section of the ops page.
- `scripts/modules-on-disk.ts` supplies `REPO_ROOT`, used as `ROOT` for resolving paths.
- `scripts/cli.ts` supplies `hasFlag`, used to parse `--check`.
- `scripts/fail-script.ts` supplies `failScript`, the top-level error handler.
- `scripts/contracts/build-bundles.ts` is a graph neighbor, but this file has no visible import or call to it.

## Notes
- The Kubernetes crontab is a copy, not a reference, because kustomize refuses files outside its own directory. A hand-kept copy would drift, and `check:generated` guards both copies.
- Exit code is 1 if any target has drifted (check mode) and 0 otherwise.
