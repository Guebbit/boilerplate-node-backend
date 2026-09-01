# scripts/report-test-results.ts

## Purpose

Reads a runner's JSON test report (Jest `--json` or Vitest `json` reporter) and `coverage/lcov.info`, then prints a human-readable summary bucketed by module: per-module test counts, wall time, slowest suites/tests, failures with a one-line reason, and line coverage. It exists because the codebase is organised around deletable modules, yet the default toolchain is layer-shaped (`test:unit`, `test:contract`) and cannot answer "what does module X cost" or "which module owns a red build." Invoked via `npm run test:report`.

## Key elements

- **`bucketOf(file)`** — Maps a test-file path to a bucket label. `src/modules/<name>/` → the module name; `tests/<layer>/` → `(layer)`; other `src/<area>/` → `(area)`; fallback → `(other)`. No registration list needed.
- **`readReport(file)`** — Validates the JSON report file exists, then parses it into the `Report` interface (shared shape between Jest and Vitest).
- **`readCoverage(file)`** — Parses `lcov.info` (`SF:`/`LF:`/`LH:` lines) into a per-bucket hit/found map. Returns `undefined` when the file is absent (i.e. the run had no coverage).
- **Bucket roll-up (inline)** — Iterates `testResults[]`, accumulates suites/tests/failed/ms per bucket in a `Map<string, Bucket>`.
- **Slowest suites / slowest tests (inline)** — Sorts by duration descending, slices to `SLOWEST` (8).
- **Failures section (inline)** — Lists every failed assertion with bucket, file, name, and the first line of `failureMessages[0]`.
- **`Report` / `SuiteResult` interfaces** — Type the JSON shape both runners emit; used only for local parsing.
- **Constants** — `REPO_ROOT` (`process.cwd()`), `DEFAULT_REPORT` (`reports/test-report.json`), `SLOWEST` (8).

## Relationships

No graph neighbors. The script depends only on `node:fs` and `node:path`. It is byte-identical across `boilerplate-node-backend` and `boilerplate-vue-frontend` and is compared by `npm run check:spec-identity`.

## Notes

- **Always exits 0.** It *reads* a report the runner already gated on; a non-zero exit here would either duplicate or contradict that verdict.
- **`process.cwd()` instead of `__dirname`/`import.meta.url`** so the file is byte-identical in both CJS and ESM repos. Works because the only invocation path is `npm run` from the package root.
- **Sort order:** module names (unparenthesised) sort before layer buckets (parenthesised), because a human looking for "which module" shouldn't scroll past `(integration)`.
- **Suite timing** uses `endTime − startTime`; a suite that crashed on import (no timing fields) contributes 0 ms rather than `NaN`.
- **Coverage is absent by design** when the run was not a coverage run — the per-file floors in `jest.config.js` / `vitest.config.ts` remain the gate; this script only adds the per-*module* view those floors cannot express.
- **JSON over JUnit:** JSON requires no extra dependency on either side and carries per-assertion durations and ancestor titles. JUnit (for CI dashboards / PR annotations) would be *added alongside*, not as a replacement.
