---
source: scripts/testing/report-results.ts
sha256: 191ceb8ae79cd2b3d64fa75590eb557a3cdafb582b547b8dc9fac043c4839f4d
generated_at: 2026-10-01T12:41:24.672443+00:00
model: ollama:qwen3.8:27b
---

# scripts/testing/report-results.ts

## Purpose

A standalone CLI script (`npm run test:report`) that reads a runner's JSON test report (Jest `--json` or Vitest `json` reporter — same shape) and prints a human-readable summary: per-module roll-up of suites/tests/failures/time, the slowest suites and tests, failures grouped by owning module, and (when present) per-module line coverage from `lcov.info`. It exists because the codebase is organised by deletable modules, yet no other tool in the stack attributes test cost or ownership at that level.

## Key elements

- **`bucketOf(file)`** — Derives a module/layer label from a test file's path. Priority: `src/modules/<name>/` → bare name; `tests/<layer>/` → `(layer)`; `src/<area>/` → `(area)`; otherwise `(other)`.
- **`readReport(file)`** — Reads and parses the JSON report; exits with code 2 and a hint if the file is missing.
- **`readCoverage(file)`** — Parses `lcov.info` (`SF:`/`LF:`/`LH:` lines) into per-bucket hit/found totals. Returns `undefined` when the file is absent (non-coverage run).
- **Main script body** — Aggregates buckets, prints the summary table, slowest-suites list, slowest-tests list, failure list (first line of each message only), and optional coverage table.
- **`REPO_ROOT`** — Set to `process.cwd()` (not `__dirname`/`import.meta.url`) so the file is byte-identical in both CJS and ESM repos.
- **`SLOWEST`** — Constant (8) controlling how many rows the "slowest" sections print.
- **`Report` / `SuiteResult` interfaces** — Describe the shared JSON shape emitted by both Jest and Vitest.

## Relationships

No graph neighbors are recorded. The script is intentionally dependency-free (only `node:fs` and `node:path`) so it can live unchanged in both boilerplate repos.

## Notes

- **Shared but unenforced.** The file is meant to be byte-identical in `boilerplate-node-backend` and `boilerplate-vue-frontend`, but it is *not* listed in `SHARED_FILES` (`scripts/pairing/spec-identity.ts`). Drift detection is manual `diff`.
- **Invocation contract.** Always run via `npm run test:report [-- <file.json>]` from the package root; `process.cwd()` is the only resolution basis for paths.
- **JSON, not JUnit.** Chosen so neither repo needs an extra dependency. If PR-line annotations are ever needed, a JUnit reporter would be *added alongside*, not as a replacement.
- **Crashed suites.** A suite that failed on import has no `startTime`/`endTime`; the script coerces to 0 rather than producing `NaN` in the time column.
- **Sorting.** Layer/area buckets (parenthesised labels) always sort *after* module names, despite `(` preceding letters in ASCII — the comparator explicitly reverses that.
- **Coverage is advisory only.** Per-file coverage floors in `jest.config.js` / `vitest.config.ts` remain the gate that fails a build; this script's coverage table is informational.
- **Failure output is an index.** Only the first line of `failureMessages` is printed; the full stack stays in the runner's own log.
