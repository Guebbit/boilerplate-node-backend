---
source: scripts/testing/report-results.ts
generated_at: 2026-11-22T02:19:17.185777+00:00
model: claude-code:claude-sonnet-5-5
---

# scripts/testing/report-results.ts

## Purpose
A CLI script (`npm run test:report`) that reads a Jest-style JSON test report and prints a summary a raw log can't give: results grouped by module (not just by file) and where the time went. It reads the report only and never fails the build. The runner has already gated on the result. The header says the frontend's copy is a declared fork, not synced and not listed in `SHARED_FILES`.

## Key elements
- `REPO_ROOT`: `process.cwd()`, used instead of `__dirname` or `import.meta.url` so the file works unchanged in both CommonJS and ESM repos.
- `DEFAULT_REPORT`: the default report path, `tmp/reports/test-report.json` under the repo root, where the `test:*:report` scripts write according to the source comment. A different path can be passed as the first CLI argument.
- `SLOWEST`: 8, the number of rows in each "slowest" list.
- `SuiteResult` / `Report`: the subset of Jest's `--json` output the script reads. These are the counts plus `testResults[]` with `assertionResults`.
- `bucketOf(file)`: maps a test path to a label.
  - `src/modules/<name>/...` becomes `<name>`.
  - `tests/<layer>/...` becomes `(layer)`.
  - `src/<area>/...` becomes `(area)`.
  - Anything else becomes `(other)`.
- `seconds(ms)`: formats milliseconds as `1.2s`.
- `readReport(file)`: parses the JSON. If the file is missing, it prints how to produce one and exits with code 2.
- Top-level script body, in order:
  1. Roll suites up into a `Map<string, Bucket>` holding suites, tests, failed and milliseconds.
  2. Sort the rows: modules alphabetically first, then parenthesised layer buckets.
  3. Print a headline with totals and summed suite time.
  4. Print the per-bucket table.
  5. Print the slowest suites.
  6. Print the slowest tests.
  7. Print the failures, only if there are any.

## Relationships
No graph neighbors. It depends only on `node:fs` and `node:path`. Its input is the JSON written by the `test:*:report` npm scripts, such as `npm run test:unit:report`.

## Notes
- Suite time is `endTime - startTime` summed across suites. With parallel workers this exceeds real wall-clock time, even though the variable is named `wall`. Missing timings count as 0.
- Only tests with `status === 'failed'` count as failures. Each failure shows only the first line of its first failure message.
- Layer and area buckets sort after modules on purpose. A leading `(` would otherwise sort before letters in ASCII.
- The script always ends with exit code 0, except for the missing-report exit 2. This is intentional, so it can't contradict the test runner's own verdict.
- It runs on import, with no `main` function or exports.
- The script uses `toSorted` and `replaceAll`, so it needs a recent Node version.
