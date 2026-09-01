# stryker.config.json

## Purpose

Configuration file for [Stryker Mutating](https://stryker-mutator.io/) mutation testing. It defines which source files are mutated, how tests are executed (via a dedicated Jest config), where reports are written, and the performance/quality thresholds that gate CI.

## Key elements

- **`testRunner` / `jest`** – Runs mutations with Jest using a *custom* project type and `jest.config.mutation.js`. `enableFindRelatedTests: true` lets Stryker skip unrelated tests for speed.
- **`jest.config.testPathIgnorePatterns`** – Excludes integration, contract, fuzz, and specific cross-cutting test files from the mutation run (only unit-level tests exercise mutants).
- **`mutate`** – Glob patterns targeting `src/infrastructure/`, `src/kernel/`, and `src/modules/*/**`, explicitly excluding barrel `index.ts` files and module-level test directories.
- **`ignorePatterns`** – Directories (coverage, reports, dist, docs, tmp) that Stryker should never scan or write into.
- **`coverageAnalysis: "perTest"`** – Stryker maps coverage per individual test, enabling the find-related-tests optimisation.
- **`incremental: true`** – Only mutate files that have changed since the last baseline, reducing CI time on large PRs.
- **`thresholds`** – Mutation score gates: score ≥ 80 is "high", < 60 is "low", and the run **fails** if the score drops below 60 (`break`).
- **`reporters` / `htmlReporter` / `jsonReporter`** – Outputs HTML and JSON reports to `reports/mutation/`.
- **`timeoutMS: 30000`** – A single mutant that takes > 30 s is killed and marked as timeout.
- **`concurrency: 4` / `maxTestRunnerReuse: 5`** – Run up to 4 mutants in parallel; recycle each Jest worker after 5 mutants to limit memory drift.

## Relationships

No graph neighbors are recorded for this file. It is a leaf configuration consumed by the Stryker CLI at run time and referenced (indirectly) by `jest.config.mutation.js` which it points to.

## Notes

- The Jest config used here (`jest.config.mutation.js`) is **separate** from the standard `jest.config.js`; changes to one do not automatically propagate to the other.
- `incremental: true` means Stryker caches a baseline (usually under `.stryker-tmp*/` or `.stryker/`). Deleting that cache forces a full re-mutation on the next run.
- The `mutate` globs intentionally skip `src/modules/*/index.ts`. If a new module's barrel re-exports logic, that logic will **not** be mutation-tested unless the source file it re-exports is matched by another glob.
- `thresholds.break` is what makes CI red; `high`/`low` only affect report colouring. A score of 59 fails the build, 60 passes.
