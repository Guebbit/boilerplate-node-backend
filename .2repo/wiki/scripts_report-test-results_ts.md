# scripts/report-test-results.ts

## Purpose

A read-only CLI reporter (invoked as `npm run test:report`) that ingests a Jest/Vitest JSON test report and prints a module-bucketed summary: per-module test counts and timings, slowest suites and tests, named failures, and optional line-coverage from `lcov.info`. It exists because the runner's raw log is flat and file-shaped, while the codebase is organised by module — this script bridges that gap without adding any dependency.

## Key elements

- **`bucketOf(file)`** — Maps a test-file path to a bucket label: the module name from `src/modules/<name>/`, or a parenthesised layer (`(integration)`, `(app)`, etc.) for shared suites and non-module source. Pure path parsing, no registration.
- **`readReport(file)`** — Reads and parses the JSON report; exits `2` with a hint if the file is missing.
- **`readCoverage(file)`** — Parses `coverage/lcov.info` (the one format both Jest and Vitest emit) into per-bucket hit/found line counts. Returns `undefined` when no coverage file exists.
- **Main execution block** — Builds the bucket table, prints slowest suites/tests (top 8), lists failures with first-line reason, and prints coverage percentages. Always exits `0`.
- **`SLOWEST`** — Constant (`8`) controlling how many rows the "slowest" sections display.
- **`DEFAULT_REPORT`** — `reports/test-report.json` relative to `process.cwd()`; overridable via a CLI argument.

## Relationships

No graph neighbors are recorded for this file. It depends only on Node built-ins (`node:fs`, `node:path`) and is invoked exclusively via `npm run` scripts in the package.

## Notes

- **Shared script constraint.** This file must remain byte-identical across `boilerplate-node-backend` and `boilerplate-vue-frontend`; `npm run check:spec-identity` enforces that. Any change must be made in both repos simultaneously.
- **`process.cwd()`, not `__dirname`.** Deliberate choice so the same file works in both CommonJS and ESM contexts. The script is only ever started by `npm run`, which sets the cwd to the package root.
- **Always exits zero.** This script *reads* a report the runner already gated on; a non-zero exit here would duplicate or contradict the runner's verdict.
- **JSON over JUnit.** Chosen because both Jest (`--json`) and Vitest (`json` reporter) emit the same shape without extra dependencies. The file's docstring explicitly notes that a JUnit reporter would be *added alongside* this one, not used to replace it, if PR-line annotations are ever needed.
- **Coverage is informational only.** The per-file percentage floors in `jest.config.js` / `vitest.config.ts` remain the actual build gate; this section merely surfaces what a module-level floor cannot express.
