---
source: tests/cross-cutting/ci-covers-the-gate.test.ts
sha256: 1715ec652163f1df25489e745d29af22ce65a6055bd1b3a4b1bde1e05002bffd
generated_at: 2026-09-23T19:54:17.419076+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/ci-covers-the-gate.test.ts

## Purpose

Cross-cutting guard that asserts every check in the `npm run complete` chain (the pre-commit local gate) has a corresponding job in `.github/workflows/`. It exists to close the bypass path where `--no-verify`, a missing Husky hook, or a fork PR lets a contributor skip local checks while CI stays green.

## Key elements

- **`packageScripts()`** — Reads `package.json` and returns the `scripts` map.
- **`expand(script, all, seen?)`** — Recursively expands a script into the leaf script _names_ it ultimately runs by following `npm run X` chains. Uses a `seen` set for cycle detection. Leaf commands (e.g. `jest …`, `tsc --noEmit`) contribute no name.
- **`scriptsRunByCi(all)`** — Reads every `.github/workflows/*.yml`, extracts `npm run <name>` tokens (filtering out comment lines), and returns the set of those names **plus** everything they expand to.
- **`COVERED_UNDER_ANOTHER_NAME`** — Small exception map (currently one entry: `test:cross-cutting` → `test:unit:coverage`) for gate members CI covers under a different spelling. Each entry requires a justification comment.
- **Test: "leaves no member of `complete` without a job"** — Expands `complete`, checks membership in the CI set (with exception-map fallback), asserts the uncovered list is empty.
- **Test: "actually reads both sides"** — Canary asserting `expand('complete')` yields >10 members and `scriptsRunByCi` yields >5, so a vacuous pass (file moved, regex broke) fails loudly.

## Relationships

No graph neighbors recorded for this file.

## Notes

- **One-directional by design.** CI may legitimately run _more_ than the gate (e.g. `fuzz.yml`, `mutation.yml` are nightly jobs absent from `complete`). The test only fails on the missing-from-CI direction.
- **Comments are filtered** when scanning workflow YAML. Without that, a comment mentioning `npm run complete` would count as coverage.
- **Exception list is deliberately tiny.** The repo convention is to avoid exception lists; the two entries here require a diff-visible justification. Adding a new entry is expected to draw review attention.
- **`expand` treats a script with no `npm run` children as its own leaf name**, so it is the unit CI must name. A script that _does_ call other scripts contributes only its grandchildren, not itself.
