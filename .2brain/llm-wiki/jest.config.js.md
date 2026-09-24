---
source: jest.config.js
sha256: bb0c3629e342cfbffa68f50a55c11d10a8db3a2033cf4adb6c858689a37e2822
generated_at: 2026-09-23T17:15:20.501014+00:00
model: ollama:qwen3.8:27b
---

# jest.config.js

## Purpose

Jest configuration for the unit test run and the base config that other Jest configs extend. Written as `.js` (not `.json`) so the per-file coverage floors can carry inline explanations. The floors act as a ratchet and a fast proxy for the mutation run (the real instrument).

## Key elements

- **`readEnvFile()`** — Reads `.env` via `parseEnv` without merging into `process.env`, preventing real rate-limit values from leaking into Jest workers before `tests/support/setup.ts` can raise them.
- **`envFileValues`** — Memoised result of `readEnvFile()`; consulted by every knob below.
- **`DEPTH_KNOBS`** — Allowlist of test-depth variables (`TEST_FUZZ_RUNS`, `TEST_PROPERTY_RUNS`, etc.) promoted from `.env` into `process.env` so they cross into Jest workers.
- **`fromEnvironment(name, fallback)`** — Resolves a positive integer from a real env var (wins), then `.env`, then a hardcoded fallback.
- **`floor(statements, branches, functions, lines?)`** — Builds one `coverageThreshold` entry; `lines` defaults to `statements` because `coverageProvider: 'v8'` derives both from the same range data.
- **`STANDARD` / `PARTIAL` / `UNTESTED`** — Shared threshold presets (70/70/70, 25/70/0, 0/0/0).
- **`module.exports`** — The Jest config object: `ts-jest` preset, V8 coverage, custom `test-environment.ts`, `maxWorkers`/`workerIdleMemoryLimit` fallbacks, `testMatch` for `tests/**/*.test.ts`, path ignores, `collectCoverageFrom`, and the per-file `coverageThreshold` map.

## Relationships

- **`jest.config.cluster.js`** — Extends this file (so it inherits `DEPTH_KNOBS` promotion and shared settings) but runs no `globalSetup` of its own. The `tests/cluster/` directory is explicitly excluded from this config's `testPathIgnorePatterns` so cluster tests are never picked up by a bare `npx jest`.
- **`jest.config.mutation.js`** — Also extends this file. The coverage floors here are described as "a fast proxy for the mutation run"; the mutation config uses the same floors while Stryker performs its actual mutation testing.

## Notes

- **Coverage-threshold glob shape matters:** a key that names a directory pools all files beneath it into one aggregate total; a glob (`*`) applies the floor to each matched file individually. A key matching no file is silently ignored by Jest.
- **Exemptions require two halves:** an extglob negation in one key _plus_ the file's own dedicated key. Omit either and the strict check still runs.
- **`tests/cross-cutting/coverage-thresholds.test.ts`** is the safety net that turns red if a file falls out of the threshold map entirely (Jest would silently skip it).
- **`maxWorkers` / `workerIdleMemoryLimit` here are fallbacks only.** The real sizing lives in `scripts/testing/machine-budget.ts` (ESM), which this CommonJS file cannot import. That script passes `--maxWorkers`, `--workerIdleMemoryLimit`, and `--max-old-space-size` on the command line for every npm-run suite, beating these values.
- **`JEST_WORKERS` in `.env` still wins** over the hardcoded `DEFAULT_MAX_WORKERS = 2` via `fromEnvironment`.
- **Controllers are deliberately unfloored** (no entry in `coverageThreshold`).
- **Co-located specs are excluded** from `collectCoverageFrom` (`!src/**/tests/**`) so a module's own tests do not count toward its coverage.
