# stryker.deep.json

## Purpose

Stryker Mutator configuration for the project's "deep" mutation-testing run. It defines which source files are mutated, how Jest is invoked as the test runner, where reports land, and the quality thresholds that gate CI. The "deep" suffix distinguishes this configuration from any lighter/faster mutation profile the repo may maintain.

## Key elements

- **`mutate`** – Glob patterns targeting `src/infrastructure/**`, `src/kernel/**`, and `src/modules/*/**` (excluding module `index.ts` barrels and in-module `tests/` directories).
- **`jest`** – Declares a custom Jest project (`projectType: "custom"`) backed by `jest.config.mutation.js`, with `enableFindRelatedTests` on and an extended `testPathIgnorePatterns` that skips contract, fuzz, and two specific cross-cutting tests.
- **`reporters` / `htmlReporter` / `jsonReporter`** – Emits HTML, clear-text, progress, and JSON output; persistent reports are written under `reports/mutation-deep/`.
- **`incremental` / `incrementalFile`** – Enables incremental mutation (only re-mutates files changed since the last run), storing state in `reports/stryker-incremental-deep.json`.
- **`coverageAnalysis: "perTest"`** – Uses per-test (not per-file) coverage to scope which tests run against each mutant.
- **`thresholds`** – `high: 80`, `low: 60`, `break: 60` — the `break` threshold fails CI when the mutation score drops below 60 %.
- **`timeoutMS: 30000` / `concurrency: 4` / `maxTestRunnerReuse: 1`** – Per-test timeout, parallel worker count, and test-runner lifecycle (each test run gets a fresh Jest process).
- **`ignorePatterns`** – Directories Stryker should never scan or report on (coverage, reports, dist, docs, tmp).

## Relationships

No graph neighbors are registered for this file. It is a leaf configuration consumed by the `stryker` CLI; the Jest config it references (`jest.config.mutation.js`) is the only external file it depends on at runtime.

## Notes

- The `"deep"` naming is a convention, not a Stryker feature — it simply signals a heavier, more thorough run compared to a potential `stryker.json` or `stryker.fast.json`.
- `maxTestRunnerReuse: 1` means every test invocation spawns a new Jest process, which is safer for state isolation but slower; this is deliberate given the `perTest` coverage strategy.
- Contract and fuzz tests are explicitly excluded from mutation runs (both via `testPathIgnorePatterns` and the `mutate` glob excluding `src/modules/*/tests/**`). They are likely validated by separate pipelines.
- The `incremental` state file lives under `reports/`, which is itself in `ignorePatterns` — the state file persists across runs but is excluded from Stryker's own file scanning.
