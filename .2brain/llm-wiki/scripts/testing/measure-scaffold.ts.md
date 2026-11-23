---
source: scripts/testing/measure-scaffold.ts
source_sha256: 0c89437478a774b136e02ba0eae231ba684e92a30c14e72b539288b80ac54e45
context_sha256: 32e35cb601dd4b93e730c0e937d416ceca8ea69d7779ed4bf4a002276cff1873
generated_at: 2026-11-22T02:19:03.191505+00:00
model: claude-code:claude-sonnet-5-5
---

# scripts/testing/measure-scaffold.ts

## Purpose
Backs `npm run measure:scaffold`. It answers whether a freshly scaffolded module passes the repo's own gate. It copies the checkout to a scratch directory and runs `scaffold:module` there. It then runs the commands a developer would run next and prints PASS/FAIL for each. It is report-only and not part of the commit gate, because it takes minutes. Run it after changing `scripts/scaffold/` or a shared file the scaffolder edits (the roles YAML, the conformance fixture, the parity canary).

## Key elements
- `SCRATCH`: `<os tmpdir>/scaffold-measure`. It sits outside the checkout because `fs.cpSync` refuses a destination inside its own source.
- `PROBE` (`measure-probes`): the main scaffolded module. Its hyphenated plural exercises every casing.
- `QUIET` (`quiet-things`): a second module scaffolded with `--no-audit --group shop --entity QuietThing`, so the `--no-audit` templates are compiled too.
- `FOLDERS`: `src/modules/<name>` for both modules, used by checks that name paths.
- `Check` interface: `label`, `command`, `args`, and optional `expectFailure`. When `expectFailure` is true, a non-zero exit counts as a pass.
- `CHECKS`: the ordered list of steps:
  1. Scaffold `PROBE`.
  2. Scaffold `QUIET`.
  3. `ts-check`.
  4. ESLint with `--max-warnings 0` on the module folders, `src/modules.ts` and `tests/cross-cutting`.
  5. Prettier `--check` on the module folders, both module docs pages and `src/modules.ts`.
  6. Jest on the module folders.
  7. `generate-module-graph.ts --check`.
  8. `test:cross-cutting`.
  9. `docs:build`.
  10. A repeat scaffold of `PROBE` with `--no-regenerate`, which must be refused.
- `run(check)`: logs a label, runs the check in `SCRATCH` via `runIn`, and returns whether the result matches what was expected.

## Relationships
- `./scratch-copy`: supplies `assembleScratchCopy(REPO_ROOT, SCRATCH)`, which builds the scratch copy, and `runIn`, which executes each command there.
- `../modules-on-disk`: supplies `REPO_ROOT`, the source of the copy.

## Notes
- The script runs at import time with no exports. It copies, runs all checks, prints a summary, then sets `process.exitCode` to 0 if every check passed and 1 otherwise. It uses `exitCode` rather than `exit()` so pending output can flush.
- All checks run in the scratch copy, never in the real checkout.
- Every check runs even if an earlier one fails. Results are collected first and summarized afterwards.
- The final "second scaffold is refused" check verifies that scaffolding is idempotent-safe.
- The exit code is nonzero on failure, but CI runs this report-only, not as a gate.
