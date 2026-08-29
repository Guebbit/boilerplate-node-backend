# stryker.deep.json

## Purpose

Stryker mutation-testing configuration for a "deep" run (`npm run test:mutation:deep`) that extends the standard scope with integration suites. It exists because the default run (unit + cross-cutting only) reports files whose tests live in `tests/integration/` as 0% NoCoverage, even when they are well-tested. This file is a slower, second measurement for a broader scope — a nightly diagnostic, not a per-commit gate.

## Key elements

- **`_comment`** — multi-paragraph in-file rationale covering why the deep run exists, why it is not the default (wall-clock cost), what remains excluded (contract/fuzz tests) and why, and how to interpret the output.
- **`jest`** — uses a custom Jest config (`jest.config.mutation.js`) with `enableFindRelatedTests: true`. `testPathIgnorePatterns` excludes `tests/contract/`, `tests/fuzz/`, module-level contract tests, and two specific cross-cutting files.
- **`mutate`** — targets `src/infrastructure/`, `src/kernel/`, and `src/modules/*/**`, explicitly excluding each module's `index.ts` and `tests/` directory.
- **`reporters`** — `html`, `clear-text`, `progress`, `json`; HTML and JSON reports land under `reports/mutation-deep/`.
- **`incrementalFile`** — `reports/stryker-incremental-deep.json`, kept separate from the default run's incremental state.
- **`thresholds`** — `high: 80`, `low: 60`, `break: 60`.
- **`timeoutMS: 30000`** — generous per-mutant timeout to accommodate integration tests that hit a real in-memory Mongo.
- **`concurrency: 4`**, **`maxTestRunnerReuse: 5`** — tuning for a heavier test-runner workload.

## Relationships

No graph neighbors are recorded for this file. It is a standalone configuration consumed by `@stryker-mutator/core` via the `npm run test:mutation:deep` script; it does not import or depend on other source files at runtime.

## Notes

- **Not a replacement for `stryker.config.json`.** The two files answer different questions at different scopes. Do not merge them.
- **Feeds no baseline.** The deep run's results must *not* be written into `mutation-baseline.json`; the ratchet compares like-with-like, and a wider-scope baseline would register as a mass regression on every subsequent default run. Compare deep runs against the *previous* deep run.
- **Contract and fuzz tests are deliberately excluded even here.** Contract tests boot the full app via supertest, which would cause `enableFindRelatedTests` to relate nearly every mutant to the entire suite (full app boot per mutant). Fuzz tests are non-deterministic by design, producing scores that shift run-to-run.
- **Integration mutants are expensive.** In a measured sample (196 mutants, `src/modules/products/repository.ts`), 45 mutants caused a query hang and each paid the full `timeoutMS` before being recorded as killed. Extrapolated across `src/modules/`, the full run is multi-hour.
- The `_comment` field is not decorative documentation; it is the project's authoritative explanation of why this configuration exists and how to read its output. Preserve it when editing.
