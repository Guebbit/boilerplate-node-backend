---
source: jest.config.js
sha256: 83a4ca18ff8fcabffccce3647708de20840d513da728fc3523d42492ed9f61f1
generated_at: 2026-11-08T02:25:31.663485+00:00
model: ollama:qwen3.8:27b
---

# jest.config.js

## Purpose

Jest configuration for the **unit** test run and the **base** that the broker, cluster, and mutation configs extend. Written as a `.js` file (rather than `.json`) so settings can carry inline explanations and the file can perform small runtime logic (reading `.env`, resolving worker counts). Coverage is intentionally not measured here; mutation score is the project's test-quality metric.

## Key elements

- **`readEnvFile()`** — Reads the project `.env` via `node:util`'s `parseEnv` *without* merging into `process.env`, avoiding the side-effect of `process.loadEnvFile()` leaking values into jest workers before `tests/support/setup.ts` can adjust them.
- **`envFileValues`** — Memoised result of `readEnvFile()`; consulted by every subsequent knob lookup so the file is read exactly once.
- **`DEPTH_KNOBS`** — Allowlist of test-depth variables (`TEST_FUZZ_RUNS`, `TEST_PROPERTY_RUNS`, `TEST_PROPERTY_RUNS_DB`, `TEST_RACE_SIZE`) promoted from `.env` into `process.env` so they cross the jest-worker boundary. Deliberately an allowlist, never a wholesale merge.
- **`DEFAULT_MAX_WORKERS` / `DEFAULT_WORKER_MEMORY_MB`** — Conservative fallbacks (2 workers, 1400 MB) used only when no npm script / `machine-budget.ts` has already set `--maxWorkers` / `--workerIdleMemoryLimit` on the CLI.
- **`fromEnvironment(name, fallback)`** — Resolves a numeric setting from `process.env` first, then `.env`, falling back to the supplied default. Used for `JEST_WORKERS` and `JEST_WORKER_MEMORY_MB`.
- **`maxWorkers`** — Resolved worker count; gates whether `workerIdleMemoryLimit` is set at all (undefined when `maxWorkers === 1` to prevent jest's in-band path from stalling).
- **`module.exports`** — The full Jest config object: `ts-jest` preset, custom test environment, `testMatch`, `testPathIgnorePatterns`, `globalSetup`/`globalTeardown`, `setupFiles` / `setupFilesAfterEnv`, `transform` (ts-jest + a targeted babel-jest for ESM-only transitive deps), `transformIgnorePatterns`, and `moduleNameMapper` (path aliases + `puppeteer-core` stub).

## Relationships

- **`jest.config.cluster.js`** — Extends this file; excludes `tests/cluster/` from this config's `testPathIgnorePatterns` because cluster tests spawn `src/cluster.ts` as a child process with their own Mongo/Redis. Runs no `globalSetup` of its own, which is why DEPTH_KNOBS promotion lives here rather than in `globalSetup`.
- **`jest.config.broker.js`** — Extends this file; `tests/broker/` is ignored here because broker tests require a live RabbitMQ and no database.
- **`jest.config.mutation.js`** — Extends this file; must drop `workerIdleMemoryLimit` when it narrows `maxWorkers` to 1 (the comment in this file calls out this coupling explicitly).

## Notes

- **`workerIdleMemoryLimit` is conditional.** It is set to `undefined` when `maxWorkers === 1`. Any config that spreads this file and then lowers `maxWorkers` to 1 **must** also unset this key, or jest takes the implicit in-band path and can hang (observed: 87-minute silent run).
- **`.env` is read, never merged.** The only values that reach `process.env` are the four `DEPTH_KNOBS` and the two worker knobs, and only via `??=` (real environment variables always win).
- **`transformIgnorePatterns` is deliberately unanchored.** The regex checks whether `@scure`, `@noble`, `jose`, `oauth4webapi`, or `openid-client` appears *anywhere* past `node_modules/`, because `@noble/hashes` can be nested in an unhoisted copy.
- **`puppeteer-core` is stubbed**, not transformed — v25 is ESM-only and jest's CJS runtime cannot parse it; the stub at `tests/support/puppeteer-core.stub.ts` replaces it wholesale.
- **`cacheDirectory` is under `node_modules/.cache/jest`** so multiple lane slots (symlinked `node_modules`) share the transform cache; entries are keyed by absolute path to avoid collisions.
- **`testEnvironment` is a custom TS file** (`tests/support/test-environment.ts`) that additionally clears leftover timers, preventing the entire module graph from staying alive in single-process runs (e.g., Stryker dry runs).
