# jest.config.js

## Purpose

Jest configuration for the unit + cross-cutting test suite. Exists as `.js` (not `.json`) so that coverage thresholds can carry inline explanations, and so that runtime logic (worker-count resolution, env-file reading) can live next to the config it guards.

## Key elements

- **`readEnvFile()`** – Reads the project `.env` via `node:util`'s `parseEnv` and returns a plain object (or `{}`). Deliberately avoids `loadEnvFile` to prevent merging the entire dev environment into every Jest worker's `process.env`.
- **`resolveMaxWorkers()`** – Returns the worker count: `JEST_WORKERS` (real env var or `.env` file) if set and valid, otherwise `Math.max(1, os.cpus().length - 2)`. Caps parallelism to avoid OOM on large machines.
- **`module.exports`** – The Jest config object:
  - `preset: 'ts-jest'`, `coverageProvider: 'v8'`, `testEnvironment: 'node'`, `clearMocks: true`
  - `testMatch: ['**/tests/**/*.test.ts']`
  - `testPathIgnorePatterns` – excludes `/node_modules/`, `.stryker-tmp/`, `.tmp/`, and `tests/cluster/`
  - `collectCoverageFrom` – `src/**/*.ts` minus types, `.d.ts`, and co-located specs (`src/**/tests/**`)
  - `coverageThreshold` – per-file glob floors (e.g. `src/modules/*/model.ts`, `repository.ts`, `service.ts`) at 70% / 70% / 0% / 70% (statements / branches / functions / lines), re-fitted 2026-08-29

## Relationships

- **`jest.config.cluster.js`** – This config explicitly excludes `tests/cluster/` via `testPathIgnorePatterns`; those tests are run under the cluster config, which spawns `src/cluster.ts`, boots its own Mongo, and requires Redis.
- **`jest.config.mutation.js`** – The header positions this file's `coverageThreshold` as the cheap CI check ("is code executed?") and mutation testing (configured via `stryker.config.json` / `scripts/run-mutation-tests.ts`) as the expensive nightly check ("do tests notice when it changes?"). The `mutate` list in the Stryker config is wider than the floor list here; a file with zero coverage is free to mutate but expensive to floor.

## Notes

- **Per-file glob vs. pooled directory thresholds are not interchangeable.** A directory key pools all files into one total; a glob key applies per-file. The old pooled form let four files sit at 0% inside a "green" 70% gate.
- **A threshold key that matches zero files is silently ignored.** Renaming a source directory without updating these keys produces a green run, not an error.
- **Jest adds a file to every matching threshold group** (not the most specific one). An exemption must use an extglob negation to *leave* the glob; a lower key alongside the glob still fails the file.
- **Controllers are deliberately not floored.** They are covered by `tests/contract/` and `tests/integration/` (real HTTP); a floor on the unit run would measure the wrong suite.
- **`functions: 0` is intentional** where the unit layer calls none of a file's exports. It is a ratchet ("do not get worse"), not a target.
- **Coverage is a proxy, not a guarantee.** A line can be executed with no meaningful assertion. Mutation testing is the real instrument; coverage exists because it runs in seconds.
- **The `.env` read is a deliberate isolation choice.** `loadEnvFile` would publish the full dev env into every worker, causing `tests/support/setup.ts` rate-limit guards (`??=`) to inherit real production values and return 429 to test fixtures.
- **The fallback is `logical CPUs − 2`, not a memory calculation.** CI runners (4 vCPU) land on 2 workers, which is already correct; large dev boxes have a `.env` with `JEST_WORKERS` set.
