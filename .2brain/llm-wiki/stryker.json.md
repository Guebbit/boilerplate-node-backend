---
source: stryker.json
sha256: 3410540d375303514b543b8ab84f5ed257c4be86d71178494e4b500d14ac9a1c
generated_at: 2026-11-08T09:17:01.184576+00:00
model: ollama:qwen3.8:27b
---

# stryker.json

## Purpose

Configuration file for [Stryker Mutator](https://stryker-mutator.io/), the mutation-testing framework. It defines which source files are mutated, which tests verify them, how results are reported, and what quality thresholds apply. Running Stryker against this config will mutate the project's core source trees and check whether the Jest test suite detects the injected faults.

## Key elements

- **`testRunner` / `jest`** — Uses a *custom* Jest project (`jest.config.mutation.js`) with `enableFindRelatedTests: true` to scope each mutation to only the tests that import the mutated file. A `testPathIgnorePatterns` list excludes contract, fuzz, integration-journey, cluster, broker, and other non-unit tests from the mutation run.
- **`mutate`** — Globs targeting `src/infrastructure`, `src/kernel`, `src/domain-primitives`, and `src/modules/*/**`, while explicitly excluding `*.generated.ts`, module `index.ts` barrel files, and in-module test directories.
- **`incremental` / `incrementalFile`** — On subsequent runs only files that changed since the last stored result (`tmp/reports/stryker-incremental.json`) are re-mutated.
- **`thresholds`** — `high: 80`, `low: 60`, `break: null`. The `null` break value means a low score is reported but does **not** fail the CI pipeline.
- **`reporters`** — Outputs HTML, clear-text, progress, and JSON reports; HTML and JSON are written under `tmp/reports/mutation/`.
- **`concurrency: 4` / `maxTestRunnerReuse: 1`** — Runs up to 4 mutations in parallel but spawns a fresh Jest process for every test (avoids state leakage between mutations).
- **`coverageAnalysis: "perTest"`** — Tracks which tests cover which mutants to skip redundant runs.
- **`timeoutMS: 30000`** — Individual test-run timeout.
- **`dryRunTimeoutMinutes: 20`** — Cap for the pre-mutation dry run.

## Relationships

No graph neighbors are recorded for this file. It is a standalone configuration consumed by the Stryker CLI; the referenced `jest.config.mutation.js` and `tmp/reports/stryker-incremental.json` exist at runtime but are not tracked as dependency-graph edges.

## Notes

- `testPathIgnorePatterns` is the primary lever for keeping mutation runs fast — any new test category that should be excluded from mutation testing must be added here.
- `break: null` means mutation score gates are advisory only; CI will not go red on a low score. Change to a numeric value (e.g. `60`) to enforce a hard gate.
- The `mutate` glob `src/modules/*/**/*.ts` intentionally skips `index.ts` barrels (re-export files) and in-module tests, so only real implementation code is mutated.
- `maxTestRunnerReuse: 1` trades speed for isolation: a reused Jest worker could carry over state (mocks, timers) and produce false-survivors.
