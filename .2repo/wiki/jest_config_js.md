# jest.config.js

## Purpose

Main Jest configuration for the unit/contract test suite. Defined in JavaScript (not JSON) so the per-file coverage thresholds can carry explanatory comments. It excludes the cluster tests (delegated to `jest.config.cluster.js`) and Stryker temporary directories, and enforces per-file coverage floors using glob keys so that a single untested file inside a green directory is caught.

## Key elements

- **`readEnvFile()`** — Safely reads `.env` via `node:util`'s `parseEnv` without merging into `process.env`. Used only to extract `JEST_WORKERS`. Avoids the side-effect of republishing the whole dev environment into every Jest worker.
- **`resolveMaxWorkers()`** — Resolves the worker count: real `JEST_WORKERS` env var → `.env` value → `os.cpus().length - 2` (minimum 1). Prevents OOM kills on high-core machines by capping concurrency.
- **`coverageThreshold`** — Per-file floors using glob keys (e.g. `src/modules/*/model.ts`, `src/modules/*/domain/**/*.ts`). Globs apply per-file; directory keys would pool all files into one total. Controllers are deliberately absent (covered by contract/integration suites instead).
- **`testPathIgnorePatterns`** — Excludes `tests/cluster/`, `.stryker-tmp/`, `.tmp/`, and `node_modules/`.
- **`collectCoverageFrom`** — Includes `src/**/*.ts`, excludes type declarations, `.d.ts`, and co-located `tests/` directories so a module's own specs don't inflate its coverage.
- **`module.exports`** — Exports the full config object: `ts-jest` preset, `v8` coverage provider, `node` test environment, `clearMocks: true`.

## Relationships

- **`jest.config.cluster.js`** — Owns the `tests/cluster/` suite that this config explicitly ignores. Cluster tests spawn `src/cluster.ts` as a child process, boot their own Mongo, and need Redis; they have a separate runtime profile (minutes vs. milliseconds) and their own setup.
- **`jest.config.mutation.js`** — The mutation-testing (Stryker) config. Its `mutate` list is wider than this file's coverage floors: a file with no coverage can be mutated for free (reported without running) but is expensive to floor. This file's floors gate "is it executed?"; mutation gates "do tests notice when it changes?". This config also ignores `.stryker-tmp/` output directories.

## Notes

- **Glob vs. directory keys matter.** A threshold key naming a directory pools all files beneath it into one total. A glob key applies per-file and names each failing file. This config uses globs deliberately.
- **A matching-nothing key is silently ignored.** If a source directory is renamed or emptied, its threshold key enforces nothing while reading like a gate. Re-check these keys after any directory rename.
- **Exemptions require leaving the glob.** Jest adds a file to *every* matching group rather than picking the most specific. To exempt a file, negate it out of the glob (e.g. `!(verification|reorder)`) and give it its own key at its measured value.
- **Controllers are intentionally not floored here.** They are covered by `tests/contract/` and `tests/integration/` (real HTTP); a unit-run floor would measure the wrong suite.
- **`JEST_WORKERS` is the one variable read from `.env`.** `process.loadEnvFile()` was explicitly rejected because it merges all variables into `process.env`, which Jest then hands to every worker (causing rate-limit vars to preempt test fixtures via `??=`).
