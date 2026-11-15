---
source: scripts/testing/report-results.ts
sha256: cd56c196cc47b85f883e60810b2870127fe45c43f9efdbb3323b4636957b7c9b
generated_at: 2026-11-14T17:42:55.892376+00:00
model: ollama:qwen3.8:27b
---

# scripts/testing/report-results.ts

## Purpose
A standalone CLI script (`npm run test:report`) that reads a Jest `--json` report and prints a human-readable summary answering two questions a raw log cannot: *which module a failure belongs to* and *where the time went*. It is intentionally a read-only reporter; it never sets a non-zero exit code.

## Key elements

- **`REPO_ROOT` / `DEFAULT_REPORT`** — Resolves the repo root via `process.cwd()` (CJS/ESM-agnostic) and the default report path `tmp/reports/test-report.json`. An optional CLI argument (`process.argv[2]`) overrides the file.
- **`Report` / `SuiteResult`** — Minimal TypeScript interfaces describing the slice of Jest's JSON output this script actually reads.
- **`bucketOf(file)`** — Maps a test-file path to a label: the domain name from `src/modules/<name>/tests/…`, a parenthesised layer from `tests/<layer>/…`, a parenthesised area from `src/<area>/…`, or `(other)`. No registration or config required.
- **Bucket rollup (IIFE-style loop)** — Single pass over `report.testResults` accumulating suite count, test count, failure count, and suite duration per bucket into a `Map<string, Bucket>`.
- **Print sections** — Four `console.log` blocks: headline totals, per-bucket table (modules first, then layers), slowest 8 suites, slowest 8 individual tests, and a failures list (bucket, file, test name, first line of failure message).
- **`SLOWEST = 8`** — Row limit for the "slowest" sections.

## Relationships

No graph neighbors are recorded. The file is self-contained: it imports only `node:fs` and `node:path`, reads a JSON file, and writes to stdout. The header comment notes it is a *declared fork* in the frontend repo (not kept in step, not listed in `SHARED_FILES`).

## Notes

- **Always exits 0.** The script explicitly does not re-gate on failures; the runner that produced the report already did. A second non-zero exit here could disagree with the runner's verdict.
- **`process.cwd()` over `__dirname`.** The file must remain byte-identical across CJS and ESM repos; `__dirname` is unavailable in ESM, `import.meta.url` in CJS. This is only safe because the script is always invoked via `npm run` from the package root.
- **Wall-clock vs. suite time.** The "suite time" total sums per-suite durations, which exceeds real wall-clock when workers run in parallel. The script labels it "suite time" rather than "elapsed."
- **Crashed suites.** A suite that failed on import has no `startTime`/`endTime`; the script treats the duration as 0 rather than `NaN`.
- **Failure detail is intentionally truncated** to the first line of `failureMessages[0]` — the full stack belongs in the runner's own output.
