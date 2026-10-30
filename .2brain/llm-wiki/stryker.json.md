---
source: stryker.json
sha256: b5947a6691366437ad32764dc6b7ce95bed62f9526b8ef21ddb018f568a59158
generated_at: 2026-10-29T06:37:16.908296+00:00
model: ollama:qwen3.8:27b
---

# stryker.json

## Purpose

Configuration file for [Stryker Mutator](https://stryker-mutator.io/), a mutation-testing framework. It defines which source files to mutate, which Jest test suite to run against each mutant, how results are reported, and what performance/threshold limits apply. It is consumed by the CI mutation-testing workflow.

## Key elements

- **`testRunner` / `jest` block** — Uses Jest in `custom` project type, pointing at a dedicated `jest.config.mutation.js`. `enableFindRelatedTests: true` limits execution to tests that actually touch the mutated file.
- **`testPathIgnorePatterns`** — Excludes contract tests, fuzz tests, integration journeys, cluster tests, broker tests, and Claude worktree artifacts from the mutation run.
- **`mutate` glob list** — Targets `src/infrastructure`, `src/kernel`, `src/domain-primitives`, and `src/modules/*/**`. Explicitly excludes `*.generated.ts`, module `index.ts` barrels, and module-internal `tests/`.
- **`incremental: true` + `incrementalFile`** — Only mutates files changed since the last recorded baseline (`tmp/reports/stryker-incremental.json`), speeding up repeated runs.
- **`coverageAnalysis: "perTest"`** — Computes test coverage per individual test case rather than per file, improving precision of related-test selection.
- **`reporters`** — Emits HTML (`tmp/reports/mutation/index.html`), JSON (`mutation.json`), clear-text, and progress output.
- **`thresholds`** — `high: 80`, `low: 60`, `break: null`. The `null` break value means thresholds are advisory only and will **not** cause the process to exit non-zero.
- **`concurrency: 4`, `timeoutMS: 30000`, `maxTestRunnerReuse: 1`** — Runs 4 mutants in parallel, kills a run after 30 s, and restarts the Jest process after every single mutant (prevents cross-mutant state leakage).
- **`dryRunTimeoutMinutes: 20`** — Caps the initial full test-suite run before mutation begins.

## Relationships

- **`github/workflows/mutation.yml`** — The CI workflow that invokes Stryker Mutator in the repository. It reads this file (the default config path) to drive the mutation-testing job, uploads the HTML/JSON reports as artifacts, and (given `break: null`) treats the run as a reporting step rather than a gate.

## Notes

- The mutation run uses a **separate** Jest config (`jest.config.mutation.js`) from the project's normal Jest setup. Changes to one do not automatically affect the other.
- `break: null` means a mutation score below 60 % will **not** fail CI. If you expect a hard gate, change it to `60`.
- `maxTestRunnerReuse: 1` is intentionally low: it trades speed for isolation, ensuring no shared state between mutants. Raising it will speed things up but may hide mutants that only survive because of leaked state.
- The `incremental` baseline lives in `tmp/`, which is also in `ignorePatterns`. Deleting `tmp/` resets the incremental baseline and forces a full mutation pass on the next run.
