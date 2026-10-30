---
source: jest.config.js
sha256: 4b71f6ff24619556720ce5432beebdd33fa09460f79892fd10d8b89ac3179861
generated_at: 2026-10-29T01:19:50.156879+00:00
model: ollama:qwen3.8:27b
---

# jest.config.js

## Purpose

Base Jest configuration for the unit-test run. It exists as a CommonJS `.js` file (rather than `.json`) so each setting can carry an inline explanation, and so it can perform runtime logic (reading `.env`, computing worker counts). It is the parent config that `jest.config.cluster.js`, `jest.config.broker.js`, and `jest.config.mutation.js` extend. Coverage is deliberately not measured here; the project tracks mutation score instead.

## Key elements

- **`readEnvFile()`** — Reads `.env` into a plain object via `parseEnv` (node:util) without merging it into `process.env`, preventing real rate-limit values from leaking into every Jest worker before test setup can raise them.
- **`envFileValues`** — Memoised result of `readEnvFile()`; consulted by every knob below so the file is read exactly once.
- **`DEPTH_KNOBS`** — Allowlist of four test-depth variables (`TEST_FUZZ_RUNS`, `TEST_PROPERTY_RUNS`, `TEST_PROPERTY_RUNS_DB`, `TEST_RACE_SIZE`) promoted from `.env` into `process.env` so they cross into Jest workers. Deliberately an allowlist, never a wholesale merge.
- **`DEFAULT_MAX_WORKERS` / `DEFAULT_WORKER_MEMORY_MB`** — Fallback worker count (2) and per-worker memory ceiling (1400 MB) for ad-hoc `npx jest` invocations that bypass the npm-script budget logic.
- **`fromEnvironment(name, fallback)`** — Resolves a positive integer from `process.env` first, then `.env`, then the fallback.
- **`module.exports`** — The Jest config object: `ts-jest` preset, custom `testEnvironment` (clears timers), `globalSetup`/`globalTeardown`, `setupFiles`/`setupFilesAfterEnv` (sandbox + env reset), `testPathIgnorePatterns` (excludes `tests/cluster/` and `tests/broker/`), targeted `transform` (ts-jest for TS; babel CommonJS plugin for two ESM-only transitive deps), `transformIgnorePatterns` (carves open `@scure`, `@noble`, `jose`, `oauth4webapi`, `openid-client`), and `moduleNameMapper` (path aliases `@api`, `@app`, `@modules`, etc., plus a stub for ESM-only `puppeteer-core`).

## Relationships

- **`jest.config.cluster.js`** — Extends this file; overrides `testMatch`/`testPathIgnorePatterns` to target `tests/cluster/` and runs no `globalSetup` (those tests spawn `src/cluster.ts` and boot their own Mongo/Redis). The DEPTH_KNOBS promotion here still applies because `process.env` is the only channel into workers.
- **`jest.config.broker.js`** — Extends this file; targets `tests/broker/` which requires a real RabbitMQ and no database, so this file's DB-related setup does not apply.
- **`jest.config.mutation.js`** — Extends this file for Stryker mutation runs; inherits the same transforms, module mapping, and timer-clearing environment.

## Notes

- This file is **CommonJS** and cannot `import` the ESM module `scripts/testing/machine-budget.ts`. The npm scripts invoke that module separately and pass `--maxWorkers` / `--workerIdleMemoryLimit` on the command line, where those values override anything set here. The fixed defaults in this file are intentionally conservative for IDE gutter runs or `npx jest --onlyChanged`.
- `.env` is read with `parseEnv`, **not** `process.loadEnvFile()`, specifically so the merged environment does not reach Jest workers before `tests/support/setup.ts` can adjust rate-limit values.
- The custom `testEnvironment` (`tests/support/test-environment.ts`) clears leftover timers per file; without it a single-process run (Stryker dry run) would leak the entire module graph.
- The Babel transform is scoped to **only** `@scure/base` and `@noble/hashes` (via `transformIgnorePatterns`), not a project-wide Babel setup.
- `puppeteer-core` is replaced wholesale by a stub (`tests/support/puppeteer-core.stub.ts`) because v25 is ESM-only and cannot be parsed in Jest's CJS runtime.
- `setupFilesAfterEnv` order matters: the file-sandbox setup must run before the environment-reset setup, which builds on the sandbox.
