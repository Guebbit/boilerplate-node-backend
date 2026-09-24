---
source: scripts/testing/report-results.ts
sha256: 645ed12e66d07a2ad2e205b11a8da764b325c0b7caaf01c48d681908158e680b
generated_at: 2026-09-23T17:32:17.113549+00:00
model: ollama:qwen3.8:27b
---

# scripts/testing/report-results.ts

## Purpose

A standalone CLI script (invoked as `npm run test:report`) that reads a runner's JSON test report and reorganises the flat file-level data into module-level summaries: pass/fail counts, per-module timing, slowest suites and tests, named failures, and optional line coverage from `lcov.info`. It exists because the existing layer-shaped tooling (`test:unit`, `test:contract`, CI jobs) answers "did it pass?" but not "which module owns the red build?" or "where did the time go?".

## Key elements

- **`bucketOf(file: string)`** — Maps a test file's path to a bucket label: `src/modules/<name>/…` → `<name>`; `tests/<layer>/…` → `(layer)`; `src/<area>/…` → `(area)`; fallback `(other)`. No registration or config needed.
- **`readReport(file: string)`** — Validates the JSON report exists at the given path, parses it into a `Report` object; exits with code 2 and a hint if missing.
- **`readCoverage(file: string)`** — Parses `lcov.info` (the one coverage format both Jest and Vitest emit) into per-bucket hit/found line counts. Returns `undefined` when the file is absent (non-coverage run).
- **`REPO_ROOT`** — Set to `process.cwd()`; used for all relative-path computation. Chosen deliberately over `__dirname`/`import.meta.url` so the file is byte-identical in both CJS and ESM repos.
- **`DEFAULT_REPORT`** — `tmp/reports/test-report.json`; overridable via `npm run test:report -- <file.json>`.
- **`SLOWEST`** (8) — How many entries appear in the "slowest suites" and "slowest tests" sections.
- **`SuiteResult` / `Report`** — Local interfaces describing the shared JSON shape emitted by both Vitest's `json` reporter and Jest's `--json` output.

## Relationships

No graph neighbours. This file is self-contained: it imports only `node:fs` and `node:path`, reads files on disk, and writes to stdout. It is byte-identical in `boilerplate-node-backend` and `boilerplate-vue-frontend` and verified by `npm run check:spec-identity`.

## Notes

- **Exit code is always 0.** The script reads a report the runner already gated on; a non-zero exit here would duplicate or contradict the runner's verdict.
- **JSON, not JUnit, by design.** JUnit would require `jest-junit` on the backend. If PR-line annotations are ever needed, a JUnit reporter is added _alongside_ this one, not in place of it.
- **lcov over JSON coverage maps** because it is the single format both test runners emit without extra configuration; parsing is a handful of string checks (`SF:`, `LF:`, `LH:`).
- **Sorting convention:** module buckets (no parentheses) sort before layer buckets (parenthesised), alphabetically within each group. Parentheses sort before letters in ASCII, so an explicit comparator is needed.
- **Crashed suites:** a suite with no `startTime`/`endTime` (import crash) is treated as 0 ms rather than `NaN`.
- **Failure output shows only the first line** of `failureMessages[0]`; the full stack remains in the runner's own log. This script is an index, not a substitute.
- **Coverage section is optional** — it simply does not render when `tmp/coverage/lcov.info` does not exist (e.g. a non-coverage test run). The per-file floors in `jest.config.js` / `vitest.config.ts` remain the gate; this adds the module-level view those floors cannot express.
