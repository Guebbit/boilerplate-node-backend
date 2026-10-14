---
source: scripts/testing/report-results.ts
sha256: 608a44228f6761d07fa2c2a7f891964299eb37c0fc923f49bf3402dcc83c79fd
generated_at: 2026-10-14T07:33:17.695203+00:00
model: ollama:qwen3.8:27b
---

# scripts/testing/report-results.ts

## Purpose

CLI script (invoked via `npm run test:report`) that reads a Jest `--json` or Vitest `json` reporter artefact and prints a module-organised summary: per-module test counts and timing, the slowest suites/tests, and failures named by owning module. It exists because neither the raw log nor the flat file list tells you *which module* a failure belongs to or *where the time went*.

## Key elements

- **`bucketOf(file: string): string`** — Maps a test-file path to a bucket label. `src/modules/<name>/…` → the module name; `tests/<layer>/…` → `(layer)`; other `src/<area>/…` → `(area)`; fallback `(other)`. No registration or config needed.
- **`readReport(file: string): Report`** — Validates the file exists, parses JSON into `Report`; exits with code 2 and a hint if missing.
- **`seconds(ms: number): string`** — Formats milliseconds as `1.2s`.
- **`REPO_ROOT`** — `process.cwd()`; deliberately avoids `__dirname` / `import.meta.url` so the file stays byte-identical across CJS and ESM repos.
- **`DEFAULT_REPORT`** — `tmp/reports/test-report.json` relative to repo root; overridable via first CLI arg.
- **`SLOWEST`** (= 8) — How many entries appear in the "slowest suites" and "slowest tests" sections.
- **`SuiteResult` / `Report`** — Minimal interfaces over the JSON shape shared by Jest and Vitest (`testResults[]` → `assertionResults[]`).
- **`Bucket`** — Aggregates (`suites`, `tests`, `failed`, `milliseconds`) accumulated per bucket label.
- **Top-level flow** — One pass buckets every suite; prints a headline line, a per-bucket table (modules first, then layer buckets in alphabetical order), the 8 slowest suites, the 8 slowest individual tests, and a failure list (bucket + file + first failure line).

## Relationships

No import or export dependencies. The file is a self-contained script; it reads only `node:fs` and `node:path`. Comments reference `scripts/pairing/spec-identity.ts` (shared-file registry this file is *not* in) and `scripts/mutation/baseline.ts` (same `cwd` convention), but there is no code-level coupling.

## Notes

- **Shared by hand, not enforced.** This file is byte-identical in `boilerplate-node-backend` and `boilerplate-vue-frontend` but is *not* listed in `SHARED_FILES`; keeping copies in sync is a manual `diff` obligation.
- **Always exits 0.** Even when failures exist. The runner already gates the build; a second non-zero exit here would duplicate or risk disagreeing with that verdict.
- **Summed suite time ≠ wall clock.** Parallel workers mean the "suite time" column and headline figure exceed real elapsed time.
- **Sorting quirk.** Parenthesised layer labels sort *after* module names via an explicit `isLayer` comparator, because plain ASCII would place `(integration)` before `account`.
- **JSON over JUnit** is a deliberate choice: zero extra dependencies, strictly richer data. If PR-line annotations are ever needed, add a JUnit reporter *alongside* this one rather than replacing it.
