---
source: tests/cross-cutting/ci-covers-the-gate.test.ts
sha256: f0f0d75f33e9cddf0f4d7f0fd82b401c8ebbb7ee662de97261601319cac0d283
generated_at: 2026-11-08T09:24:52.351910+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/ci-covers-the-gate.test.ts

## Purpose

Guard test that asserts every check invoked by `npm run complete` (the local pre-commit gate) has a corresponding job in `.github/workflows/`. It exists to prevent the known bypass where a contributor uses `--no-verify`, skips husky, or opens a PR from a fork while CI stays green. The check is one-directional: CI may legitimately run *more* than the gate (e.g. nightly fuzz/mutation workflows).

## Key elements

- **`packageScripts()`** — Reads `package.json` and returns the `scripts` object.
- **`expand(script, all, seen?)`** — Recursively resolves a script into the *leaf* script names it ultimately runs by following `npm run X` chains; splits on `&&`. A script whose steps contain no further `npm run` calls is itself a leaf. Cycle-safe via a `seen` set.
- **`scriptsRunByCi(all)`** — Scans every `.yml` file in `.github/workflows/`, extracts `npm run <name>` references (ignoring comment lines), and returns the union of those names plus their `expand()` results.
- **`COVERED_UNDER_ANOTHER_NAME`** — Small exception map (currently one entry: `test:cross-cutting` → `test:unit:report`) for gate members that CI covers under a different script name. Each entry must be justified in the diff.
- **Test: "leaves no member of `complete` without a job"** — Expands `complete`, checks every member against the CI set (minus exceptions), asserts the uncovered list is empty.
- **Test: "actually reads both sides"** — Canary: asserts `expand('complete')` yields >10 members and `scriptsRunByCi` yields >5, so a silent file-move or path bug cannot produce a vacuously-passing first test.

## Relationships

- **`tests/support/paths.ts`** — Imports `REPO_ROOT` to resolve `package.json` and the `.github/workflows/` directory relative to the repo root.
- **`tests/unit/scripts/mutation/ci/waves.test.ts`** — Sibling CI-coverage test (graph neighbor); both live under the CI-coverage concern but target different workflow files.

## Notes

- Workflow comment lines (`# …`) are explicitly filtered out before regex-matching; this prevents a comment in `ci.yml` that *mentions* `npm run complete` from being counted as coverage.
- The check is **one-directional by design**: nightly workflows (`fuzz.yml`, `mutation.yml`) are intentionally absent from `complete` and are not flagged.
- `expand` treats any script whose steps are all non-`npm run` commands (e.g. bare `jest`, `tsc`) as a leaf contributing its *name*, not its arguments. Semantic argument comparison is deliberately avoided.
- The exception list is a conscious anti-pattern in this repo; adding an entry requires a justification comment and is expected to be rare.
