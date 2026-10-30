---
source: tests/cross-cutting/ci-covers-the-gate.test.ts
sha256: f0f0d75f33e9cddf0f4d7f0fd82b401c8ebbb7ee662de97261601319cac0d283
generated_at: 2026-10-29T06:44:02.118919+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/ci-covers-the-gate.test.ts

## Purpose

Guards against drift between the local pre-commit gate (`npm run complete` chain) and the CI workflow definitions. If a check reaches the gate but has no corresponding CI job, a contributor using `--no-verify`, a machine without husky, or a PR from a fork bypasses it while CI stays green. This test asserts the CI "backstop" is complete.

## Key elements

- **`packageScripts()`** — Reads and returns the `scripts` map from `package.json` at the repo root.
- **`expand(script, all, seen?)`** — Recursively resolves a script into the set of *leaf* script names it ultimately invokes. Splits on `&&`, matches `npm run <name>` steps, and recurses; non-script commands (`jest`, `tsc`, …) are leaves. Cycles are prevented via a `seen` set.
- **`scriptsRunByCi(all)`** — Scans every `.yml` file in `.github/workflows/`, extracts `npm run <name>` references (excluding comment lines), and expands each name via `expand`. Returns the full `Set` of covered script names.
- **`COVERED_UNDER_ANOTHER_NAME`** — A small, explicitly-argued exception map for gate members that CI covers under a different script name (currently `test:cross-cutting` → `test:unit:report`).
- **`describe('CI runs every check the local gate does')`** — Two tests:
  1. *leaves no member of `complete` without a job* — asserts the uncovered set is empty.
  2. *actually reads both sides* — a canary: verifies `expand('complete', …)` yields > 10 members and `scriptsRunByCi(…)` yields > 5, preventing a vacuous pass if a path moves.

## Relationships

- **`tests/support/paths.ts`** — Imports `REPO_ROOT` to locate `package.json` and the `.github/workflows/` directory relative to the repository root.

## Notes

- **One-directional by design.** CI may run *more* than the gate (e.g., `fuzz.yml`, `mutation.yml` are nightly and intentionally absent from `complete`). The test only fails on the gate-minus-CI direction.
- **Comment lines in YAML are filtered out.** Without this, a header comment in `ci.yml` that mentions a script name would count as coverage and mask the very gap the test exists to catch.
- **`COVERED_UNDER_ANOTHER_NAME` is a deliberate exception list.** The repo avoids exception lists in general, but the alternative (comparing jest CLI arguments for semantic equality) is worse. The docblock notes that each entry must be argued in a diff.
- **`expand` treats a script that runs no other `npm run` child as its own leaf.** This is what makes the comparison work at the right granularity rather than collapsing everything to top-level names.
