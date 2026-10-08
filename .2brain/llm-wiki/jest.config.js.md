---
source: jest.config.js
sha256: 3523cd11ef9297bbf69c2fe52092953cbede4c130bee7ef9345946cb11f094c8
generated_at: 2026-10-07T23:49:42.993309+00:00
model: ollama:qwen3.8:27b
---

# jest.config.js

## Purpose

Base Jest configuration for the unit-test run. It is the file that `jest.config.broker.js`, `jest.config.cluster.js`, and `jest.config.mutation.js` all extend, so it owns the shared preset, environment wiring, worker sizing, test-glob boundaries, and the per-file coverage-threshold ratchet. It is a `.js` (CommonJS) file rather than `.json` so that the threshold values can carry inline comments explaining each measurement.

## Key elements

- **`readEnvFile()` / `envFileValues`** — Reads `.env` via `node:util#parseEnv` (not `process.loadEnvFile`) so the values are available to this config without polluting `process.env` that Jest hands to every worker. Memoised to a single file read.
- **`DEPTH_KNOBS` promotion loop** — Copies a fixed allowlist (`TEST_FUZZ_RUNS`, `TEST_PROPERTY_RUNS`, `TEST_PROPERTY_RUNS_DB`, `TEST_RACE_SIZE`) from `.env` into `process.env` so harness code (`tests/support/knobs.ts`) in workers can see them. Done here rather than in `globalSetup` because `jest.config.cluster.js` runs no `globalSetup`.
- **`DEFAULT_MAX_WORKERS` (2) / `DEFAULT_WORKER_MEMORY_MB` (1400)** — Fallbacks for `maxWorkers` and `workerIdleMemoryLimit` when no npm script has already passed CLI flags. Overridable via `JEST_WORKERS` / `JEST_WORKER_MEMORY_MB` in the real environment or `.env` through `fromEnvironment()`.
- **`floor(statements, branches, functions, lines?)`** — Builds a single `coverageThreshold` entry; `lines` defaults to `statements` because the `v8` provider derives both from the same range data.
- **`moduleFloor(moduleName, file, thresholds)`** — Returns a keyed threshold object only if the module directory still exists on disk, so deleting a module (`demo:remove`) doesn't leave a dead key that fails `tests/cross-cutting/coverage-thresholds.test.ts`.
- **`STANDARD` / `PARTIAL` / `UNTESTED`** — Shared presets (70/70/70, 25/70/0, 0/0/0) reused across many threshold entries.
- **`module.exports`** — The Jest config object: `ts-jest` preset, custom `testEnvironment` (`tests/support/test-environment.ts`), `coverageProvider: 'v8'`, `testMatch` / `testPathIgnorePatterns` / `modulePathIgnorePatterns`, `collectCoverageFrom`, and the large `coverageThreshold` block.

## Relationships

- **`jest.config.broker.js`** — Extends this file (broker tests need real RabbitMQ, no DB; excluded via `testPathIgnorePatterns: ['<rootDir>/tests/broker/']`).
- **`jest.config.cluster.js`** — Extends this file (cluster tests spawn `src/cluster.ts` as a child process with their own Mongo/Redis; excluded via `testPathIgnorePatterns: ['<rootDir>/tests/cluster/']`). Runs no `globalSetup`, which is why the `DEPTH_KNOBS` promotion lives here.
- **`jest.config.mutation.js`** — Extends this file; the coverage floors in this file are described as a "fast proxy" for the mutation run that it configures (see `docs/tools/coverage-and-confidence.md`).

## Notes

- **`.env` is never merged wholesale into `process.env`.** Only the four `DEPTH_KNOBS` names are promoted. Merging the whole file would let real rate limits reach test workers before `tests/support/setup.ts` can raise them, causing 429s against fixtures.
- **Worker defaults are intentionally low (2 / 1400 MB).** The real sizing lives in `scripts/testing/machine-budget.ts`, passed as CLI flags by `scripts/testing/run-suite.ts`, which overrides everything in this file. This file only covers bare `npx jest`, IDE gutter runs, and single-file invocations.
- **Coverage threshold keys are per-file globs, not directory keys.** A directory key would pool all files into one total; a glob applies to each file separately. A key matching no file is silently ignored by Jest but caught by `tests/cross-cutting/coverage-thresholds.test.ts`.
- **`functions: 0` in a threshold** means the unit suite calls none of that file's exports (the code is driven by integration/contract suites), not that the file is untested.
- **Co-located specs under `src/**/tests/` are excluded from `collectCoverageFrom`** so they don't count toward their own module's floor.
- **`testEnvironment` is a custom TS file** that clears all pending timers after each test file; without it a single-process run (e.g. Stryker dry run) keeps every module's timer handles alive and cannot survive.
