---
source: jest.config.js
sha256: 6e4e940da09f7f29e6f01a2900ec60017f14fc013e27c2ea30810fac6f57d59e
generated_at: 2026-10-14T06:53:34.242081+00:00
model: ollama:qwen3.8:27b
---

# jest.config.js

## Purpose

Base Jest configuration for the unit-test run. Written as `.js` (not `.json`) so every setting can carry an inline explanation. Acts as the shared foundation that `jest.config.broker.js`, `jest.config.cluster.js`, and `jest.config.mutation.js` extend. Coverage is deliberately not collected here; the project tracks mutation score instead.

## Key elements

- **`readEnvFile()`** – Reads `.env` into a plain object via `node:util.parseEnv` without mutating `process.env`. Returns `{}` when the file is absent (the normal CI case).
- **`envFileValues`** – Memoised result of `readEnvFile()`, consulted by every subsequent knob so the file is read only once.
- **`DEPTH_KNOBS`** – Allowlist of test-depth variables (`TEST_FUZZ_RUNS`, `TEST_PROPERTY_RUNS`, `TEST_PROPERTY_RUNS_DB`, `TEST_RACE_SIZE`) promoted from `.env` into `process.env` so jest workers can see them. Intentionally an allowlist, not a merge.
- **`DEFAULT_MAX_WORKERS` (2) / `DEFAULT_WORKER_MEMORY_MB` (1400)** – Conservative fallbacks for ad-hoc `npx jest` runs; overridden by `JEST_WORKERS` / `JEST_WORKER_MEMORY_MB` env vars or by the machine-budget script used by npm tasks.
- **`fromEnvironment(name, fallback)`** – Resolves a positive integer from `process.env` first, then `.env`, then the fallback.
- **`module.exports`** – The actual Jest config:
  - `preset: 'ts-jest'`, custom `testEnvironment` (clears leftover timers), `testTimeout: 30_000`.
  - `testMatch` targets `**/tests/**/*.test.ts`; `testPathIgnorePatterns` excludes `tests/cluster/` and `tests/broker/`.
  - `globalSetup` / `globalTeardown` / `setupFiles` / `setupFilesAfterEnv` wire in sandboxing, environment reset, and rate-limit raising.
  - `transform`: ts-jest for TS (with diagnostic 151002 suppressed); babel-jest scoped to `@scure/base` and `@noble/hashes` for CJS interop.
  - `transformIgnorePatterns`: carves open `node_modules` for `@scure`, `@noble`, `jose`, `oauth4webapi`, `openid-client`.
  - `moduleNameMapper`: path aliases (`@api/`, `@app/`, `@modules/`, etc.) plus a stub replacing `puppeteer-core` v25 (ESM-only).

## Relationships

- **`jest.config.broker.js`** – Extends this file. Runs `tests/broker/` which needs a live RabbitMQ and no database, so this file's DB-oriented setup does not apply.
- **`jest.config.cluster.js`** – Extends this file. Runs `tests/cluster/` which spawns `src/cluster.ts` and boots its own Mongo/Redis. It executes no `globalSetup`, which is why the DEPTH-knob promotion lives here rather than in a setup hook.
- **`jest.config.mutation.js`** – Extends this file for Stryker mutation runs (single-process, hence the timer-clearing test environment).

## Notes

- `parseEnv` is used instead of `process.loadEnvFile()` specifically to avoid polluting `process.env` before `tests/support/setup.ts` can raise rate limits; a premature merge causes 429s in concurrency suites.
- `workerIdleMemoryLimit` is set *above* steady-state baseline on purpose—setting it below causes Jest to restart every worker after each file, which is slower than the retention it would save.
- `transformIgnorePatterns` is not anchored to "immediately after `node_modules`" because `@noble/hashes` can appear nested in an unhoisted sub-dependency; the regex checks whether the scope appears *anywhere* past `node_modules/`.
- The `maxWorkers` / `workerIdleMemoryLimit` values here are only a fallback for bare `npx jest` or IDE gutter runs. Every npm script goes through `scripts/testing/run-suite.ts` → `machine-budget.ts`, which computes values from `MemAvailable` and passes them on the CLI, overriding this file.
- `puppeteer-core` is replaced by a stub, not transformed, because v25 ships ESM-only and cannot be parsed under Jest's CJS runtime.
