---
source: tests/cross-cutting/ci-covers-the-gate.test.ts
sha256: 691f3dde8216946fc75dbbdf4b4fd0258569c95f766bdc2d0dc2f6eb7fa40747
generated_at: 2026-10-15T12:36:17.105223+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/ci-covers-the-gate.test.ts

## Purpose

Cross-cutting guard that asserts every check invoked by `npm run complete` (the local pre-commit gate) has a corresponding `npm run` reference in a GitHub Actions workflow. It exists to close the known bypass path where `--no-verify`, a missing husky install, or a fork PR lets a contributor skip local checks while CI stays green. The comparison is one-directional: CI is allowed to run *more* than the gate (e.g. nightly `fuzz.yml`, `mutation.yml`).

## Key elements

- **`packageScripts()`** — reads `scripts` from `package.json` at the repo root.
- **`expand(script, all, seen?)`** — recursively resolves a script name into the *leaf* script names it ultimately invokes (follows `npm run X` links split on `&&`; real commands like `jest …` or `tsc` are leaves that contribute no further names). Returns an empty array for cycles.
- **`scriptsRunByCi(all)`** — scans every `.yml` in `.github/workflows/` for `npm run <name>` references (skipping comment lines), then expands each name via `expand`. Returns a `Set<string>` of all covered script names.
- **`COVERED_UNDER_ANOTHER_NAME`** — a small exception map (currently one entry: `test:cross-cutting` → `test:unit:report`) for checks that are covered under a different script name. Requires a justified diff entry.
- **Test: "leaves no member of `complete` without a job"** — expands `complete`, subtracts the CI-covered set (plus exceptions), and asserts the remainder is empty.
- **Test: "actually reads both sides"** — canary that both `expand('complete')` and `scriptsRunByCi()` return non-trivially sized results, so a silent path change (moved file, renamed script) fails loudly rather than producing an empty "all covered" set.

## Relationships

- **`tests/unit/scripts/mutation/ci/waves.test.ts`** — both files live in the "CI coverage" concern. This test explicitly references `mutation.yml` as a nightly workflow that is *deliberately absent* from `complete`; `waves.test.ts` exercises the mutation wave mechanics that `mutation.yml` invokes. Together they pin the contract that mutation checking exists in CI but is not part of the local gate.

## Notes

- The `expand` function treats a script that contains **no** `npm run` child as a leaf and returns `[itself]`; a script that **does** contain children returns only the grandchildren. This means intermediate "grouping" scripts (e.g. `test-unit`) are skipped in the comparison — only the terminal units are checked.
- Workflow parsing is intentionally regex-over-`npm run`; it does not understand YAML structure. The comment-filter (`.filter(line => !line.trimStart().startsWith('#'))`) exists because `ci.yml`'s header *mentions* `npm run complete` in prose and would otherwise count as coverage.
- The test reads the filesystem at `__dirname/../../`, so it depends on being run from its canonical location. The canary test is the safety net if that assumption breaks.
