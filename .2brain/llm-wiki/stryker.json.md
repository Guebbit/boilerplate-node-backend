---
source: stryker.json
sha256: 8ae13a825864a0b1ea172b796cdd30cddf8807ca79bfe8f367eecbb030ff2642
generated_at: 2026-09-23T19:50:38.405463+00:00
model: ollama:qwen3.8:27b
---

# stryker.json

## Purpose

Stryker mutation-testing configuration for this repository. It defines which source files are mutated, how Jest is invoked during mutation runs, where reports are written, and what thresholds gate the result. It exists so that CI (and local runs) can execute a consistent, incremental mutation-testing pass without hard-coding options elsewhere.

## Key elements

- **`mutate`** — Globs targeting `src/infrastructure/**`, `src/kernel/**`, and `src/modules/*/**` `.ts` files; explicitly excludes per-module `index.ts` barrels and all module-level `tests/` directories.
- **`testRunner` / `jest`** — Uses a custom Jest project (`jest.config.mutation.js`) with `enableFindRelatedTests` on; a `testPathIgnorePatterns` list strips contract, fuzz, cluster, and cross-cutting tests from the mutation run.
- **`incremental` + `incrementalFile`** — Enables incremental mutation analysis; the baseline state is persisted to `tmp/reports/stryker-incremental.json`.
- **`thresholds`** — High: 80 %, Low: 60 %, `break: null` (score is reported but never fails the build on its own).
- **`reporters`** — `html`, `clear-text`, `progress`, `json`; HTML and JSON reports land under `tmp/reports/mutation/`.
- **`concurrency: 4` / `maxTestRunnerReuse: 1`** — Runs 4 mutations in parallel but spawns a fresh Jest process for each, avoiding cross-mutation state leakage.
- **`timeoutMS: 30000`** — Per-mutation test timeout.
- **`dryRunTimeoutMinutes: 20`** — Upper bound for the initial (unmutated) test pass.
- **`ignorePatterns`** — Prevents Stryker from scanning `tmp/`, `dist/`, `docs/`, `.claude/`.

## Relationships

- **`github/workflows/mutation.yml`** — The CI workflow reads this file (via the default Stryker config discovery) to run mutation testing on pull requests / pushes. Thresholds and reporters configured here determine what the workflow publishes as artifacts.

## Notes

- `break` is explicitly `null`, so a score below the low threshold does **not** fail the CI step by itself; any hard gating must be enforced in the workflow script or by a separate check.
- The Jest `testPathIgnorePatterns` here are *additive* to whatever `jest.config.mutation.js` defines; if a new test category is added to the project, it must also be excluded here to avoid slowing mutation runs.
- `maxTestRunnerReuse: 1` means every single mutation gets a clean Jest instance—intentional for isolation, but it increases wall-clock time compared to reusing the runner.
- The `incrementalFile` lives under `tmp/`, which is also in `ignorePatterns`; the file is meant to be ephemeral (CI artifact) and not committed.
