---
source: jest.config.js
sha256: 097721024fe2ec7961f2bda416a10243f5026472f51d36ee0d4c0cdefc3a6d03
generated_at: 2026-10-01T12:18:56.222347+00:00
model: ollama:qwen3.8:27b
---

# jest.config.js

## Purpose

Base Jest configuration for the unit-test run. It defines worker sizing, the custom test environment, coverage collection, and per-file coverage floors. It exists as the shared foundation that `jest.config.cluster.js` and `jest.config.mutation.js` extend, and as a `.js` file (not `.json`) so the coverage floors can carry explanatory comments.

## Key elements

- **`readEnvFile`** — Reads `.env` via `node:util`'s `parseEnv` without merging into `process.env`, returning `{}` when the file is absent (the CI normal case).
- **`DEPTH_KNOBS`** — An allowlist of four `TEST_*` variables promoted from `.env` into `process.env` so jest workers can see them. Promoted here (not in `globalSetup`) because `process.env` is the only channel that crosses into a worker, and `jest.config.cluster.js` runs no `globalSetup`.
- **`fromEnvironment`** — Resolves a value from `process.env` first, then `.env`, falling back to a supplied default. Used for `JEST_WORKERS` and `JEST_WORKER_MEMORY_MB`.
- **`floor(statements, branches, functions, lines?)`** — Builds a single `coverageThreshold` entry. `lines` defaults to `statements` because `coverageProvider: 'v8'` derives both from the same range data.
- **`moduleFloor(moduleName, file, thresholds)`** — Conditionally emits a keyed threshold only if the module directory exists on disk; returns `{}` otherwise so deleted modules don't leave stale keys.
- **`STANDARD` / `PARTIAL` / `UNTESTED`** — Reusable threshold presets: `(70,70,70)`, `(25,70,0)`, and `(0,0,0)` respectively.
- **`module.exports`** — The Jest config object: `ts-jest` preset, `v8` coverage, custom test environment at `tests/support/test-environment.ts`, `testMatch` of `**/tests/**/*.test.ts`, ignore patterns for `tests/cluster/` and worktrees, and the full `coverageThreshold` map keyed by glob paths.

## Relationships

- **`jest.config.cluster.js`** — Extends this file (inherits all settings above) but overrides test matching to target `tests/cluster/`. Cluster tests spawn `src/cluster.ts` as a child process with their own Mongo/Redis, so this file's setup does not apply to them.
- **`jest.config.mutation.js`** — Extends this file for Stryker mutation runs. The coverage floors here act as a fast proxy for the mutation run, which is the "real instrument" per `docs/tools/coverage-and-confidence.md`.

## Notes

- `parseEnv` is used deliberately instead of `process.loadEnvFile()` because the latter merges into `process.env`, which would hand real rate-limit values to every worker before `tests/support/setup.ts` can raise them, causing 429s against test fixtures.
- `DEFAULT_MAX_WORKERS` is intentionally low (2). The production sizing logic lives in `scripts/testing/machine-budget.ts` (ESM), which this CommonJS file cannot import; the npm scripts pass `--maxWorkers` on the command line where it overrides this value.
- Coverage-threshold keys are glob patterns applied per-file; a key naming a directory would pool all files beneath it into one total. An exemption requires both an extglob negation **and** the file's own explicit key.
- A threshold key matching no file is silently ignored by Jest but **fails** `tests/cross-cutting/coverage-thresholds.test.ts`, so a removed module must also have its floor removed.
- `collectCoverageFrom` excludes co-located specs (`src/**/tests/**`) so a module's own tests cannot inflate its coverage percentage.
- `testEnvironment` uses a custom file that clears timers left running by a test, preventing the entire module graph from staying alive (matters for single-process runs like Stryker's dry run).
