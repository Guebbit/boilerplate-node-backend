---
source: scripts/testing/report-results.ts
sha256: b36f1ec837acbe54342e5a808809e39e5f01d3b965d929d83945501bcfb2804c
generated_at: 2026-10-29T01:45:51.487986+00:00
model: ollama:qwen3.8:27b
---

# scripts/testing/report-results.ts

## Purpose

Reads a Jest `--json` test report and prints a human-readable summary that a raw log cannot provide: a per-module breakdown of suites/tests/failures, the slowest suites and individual tests, and every failure annotated with the module it belongs to. Invoked as `npm run test:report [file.json]`.

## Key elements

- **`bucketOf(file: string): string`** — Derives a module or layer label from a test file's path (`src/modules/<name>/` → module name; `tests/<layer>/` → `(layer)`; other `src/` areas → `(area)`; fallback → `(other)`).
- **`readReport(file: string): Report`** — Checks the file exists, parses the JSON, or prints a hint and exits with code 2.
- **`seconds(milliseconds: number): string`** — Formats a duration as e.g. `1.2s`.
- **`Report` / `SuiteResult` / `Bucket` interfaces** — Typed slices of the Jest JSON output and the per-bucket aggregate shape.
- **Top-level script logic** (no exports) — Reads the report, rolls up buckets, and prints four sections: headline totals, per-bucket table, slowest suites, slowest tests, and failures.
- **Constants** — `DEFAULT_REPORT` (`tmp/reports/test-report.json`), `SLOWEST` (8), `REPO_ROOT` (`process.cwd()`).

## Relationships

No dependency-graph neighbors. The script is standalone: it reads a JSON file written by a `*:report` npm script and writes to stdout only. It references `scripts/mutation/baseline.ts` and `docs/tools/testing-quickstart.md` in comments for context, but imports nothing from them.

## Notes

- **Shared script, hand-synced.** This file is kept byte-identical in `boilerplate-node-backend` and `boilerplate-vue-frontend` via manual `diff`, not via a `SHARED_FILES` mechanism. Changes must be applied to both copies.
- **`process.cwd()` over `__dirname`.** Deliberate choice so the file works in both CommonJS and ESM repos without modification. Relies on the invariant that it is only ever invoked through `npm run` (cwd = package root).
- **Always exits 0.** It is a read-only viewer of a report the test runner already gated; a second non-zero exit here could contradict the runner's verdict.
- **Uses `Array.prototype.toSorted`.** Non-mutating sort; requires Node 20+ / a compatible target.
- **Suite time ≠ wall clock.** Summed `endTime − startTime` across parallel workers overcounts real elapsed time; the script labels it "suite time" to avoid confusion.
- **First failure line only.** The `failures` section prints a single line of `failureMessages[0]` as a pointer; full stacks remain in the runner's own output.
