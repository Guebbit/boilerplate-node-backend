---
source: scripts/testing/report-results.ts
sha256: 2fe6a2d783ca19987e2d8298fb127f9f14bc3b2327101ebc67778f5c3374aa3d
generated_at: 2026-11-08T03:03:01.317937+00:00
model: ollama:qwen3.8:27b
---

# scripts/testing/report-results.ts

## Purpose

A CLI script (run via `npm run test:report`) that reads a Jest `--json` report and produces a human-readable summary: a per-module table of suites/tests/failures/time, the slowest suites and tests, and a failure list grouped by owning module. It exists because the raw test log does not make it obvious *which module* a failure belongs to or *where the wall time went*.

## Key elements

- **`bucketOf(file)`** — Derives a bucket label from a test file's path: the module name if under `src/modules/<name>/`, the layer if under `tests/<layer>/`, the top-level `src/` area otherwise, or `(other)`.
- **`readReport(file)`** — Validates the JSON file exists (exits 2 with a hint if not), parses it into the `Report` shape.
- **`Report` / `SuiteResult` interfaces** — Minimal structural types for the slice of Jest's JSON output this script consumes.
- **Bucket roll-up** — A single pass over `report.testResults` accumulates suite count, test count, failure count, and duration into a `Map<string, Bucket>`.
- **Sorted output** — Modules (alphabetical) print before parenthesised layer/area buckets; uses `toSorted` (non-mutating).
- **Slowest suites / slowest tests** — Top `SLOWEST` (8) by duration, using `endTime - startTime` for suites and `duration` for individual assertions.
- **Failure listing** — Every failed assertion with bucket, file path, name, and first line of the failure message (full stack left to the runner's own output).
- **`REPO_ROOT`** — Set to `process.cwd()`; deliberately not `__dirname` or `import.meta.url` so the file is byte-identical across CJS and ESM repos.

## Relationships

No dependency-graph neighbors recorded.

## Notes

- The frontend repo keeps a **declared fork** of this file; it is *not* listed in `SHARED_FILES`, so the two copies drift independently.
- **Always exits 0.** It reads a report the runner already gated on; a non-zero exit here would duplicate or contradict the runner's verdict.
- Suite time is summed from per-suite `endTime − startTime`; under parallel workers this exceeds real wall-clock time (the script labels it "suite time" accordingly).
- A suite that crashed on import may lack `startTime`/`endTime`; the code coerces those to `0` rather than propagating `NaN`.
- Invoked only through `npm run test:report [file.json]`; the default path is `tmp/reports/test-report.json` relative to the package root.
- Rationale for JSON over JUnit and for per-module grouping lives in `docs/tools/testing-quickstart.md#why-the-report-reads-json`.
