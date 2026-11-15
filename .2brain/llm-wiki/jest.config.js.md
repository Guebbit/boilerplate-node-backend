---
source: jest.config.js
sha256: b38f2dfe530c1877aefd43e48ab468ad7c8d0571ce6633e84f9c43b1a788d388
generated_at: 2026-11-14T17:13:30.927697+00:00
model: ollama:qwen3.8:27b
---

# jest.config.js

## Purpose

Base Jest configuration for the unit-test run. Every other jest config in the repo (broker, cluster, mutation) extends this file. It is a `.js` (not `.json`) so each setting can carry an inline explanation, and it is the single place that wires up transforms, path aliases, environment promotion, and worker sizing for the unit lane.

## Key elements

- **`readEnvFile` / `envFileValues`** – Reads the project `.env` via `node:util#parseEnv` without merging it into `process.env`. Memoised so the file is read exactly once regardless of how many knobs consult it.
- **`DEPTH_KNOBS` loop** – Promotes four specific variables (`TEST_FUZZ_RUNS`, `TEST_PROPERTY_RUNS`, `TEST_PROPERTY_RUNS_DB`, `TEST_RACE_SIZE`) into `process.env` so they reach jest workers. Strictly an allowlist, never a wholesale merge.
- **`fromEnvironment`** – Resolves a numeric setting from `process.env` first, then `.env`, then a fallback. Used for `JEST_WORKERS` and `JEST_WORKER_MEMORY_MB`.
- **`maxWorkers` / `workerIdleMemoryLimit`** – `workerIdleMemoryLimit` is set only when `maxWorkers > 1`; a single-worker (in-band) run must leave it `undefined` or Jest misbehaves.
- **`transform`** – `ts-jest` for `.ts/.tsx` (with `tsconfig.jest.json` and a suppressed diagnostic 151002); `babel-jest` with `@babel/plugin-transform-modules-commonjs` scoped to `.js` files to handle the two ESM-only transitive deps of `otplib` (`@scure/base`, `@noble/hashes`).
- **`transformIgnorePatterns`** – Carves an exception in `node_modules` for `@scure`, `@noble`, `@mdit-vue`, `jose`, `openid-client`, `oauth4webapi`. The pattern is unanchored to handle nested/unhoisted copies.
- **`moduleNameMapper`** – Maps `@api`, `@types`, `@tests`, `@app`, `@infrastructure`, `@kernel`, `@modules`, `@domain-primitives`, `@scenarios` to their source paths, and stubs `puppeteer-core` (ESM-only, v25).
- **`setupFilesAfterEnv`** – Ordered: file-sandbox → environment-reset → fail-on-warning. Order matters (sandbox marks, reset then starts from that state).
- **`testPathIgnorePatterns`** – Excludes `tests/cluster/` and `tests/broker/` (each has its own config), plus `tmp/` and `.claude/worktrees/`.
- **`globalSetup` / `globalTeardown` / `setupFiles`** – Point to `tests/support/` scripts for harness bootstrap, teardown, and per-test-file setup (rate-limit raising, etc.).
- **`testEnvironment`** – Custom `tests/support/test-environment.ts` that extends `node` and clears leftover timers (prevents a single-process Stryker dry-run from leaking the whole module graph).

## Relationships

- **`jest.config.broker.js`** – Extends this file. Tests under `tests/broker/` are excluded from this config via `testPathIgnorePatterns`; the broker config provides its own RabbitMQ connection and omits the database setup defined here.
- **`jest.config.cluster.js`** – Extends this file. Tests under `tests/cluster/` are excluded here; the cluster lane boots its own Mongo and Redis and runs no `globalSetup` (which is why DEPTH_KNOBS are promoted at config-load time rather than in `globalSetup`).
- **`jest.config.mutation.js`** – Extends this file. When it narrows `maxWorkers` it must also drop `workerIdleMemoryLimit` to `undefined` (in-band path), per the comment in this file.

## Notes

- This file is **CommonJS** (`require`/`module.exports`) and therefore cannot import the ESM module `scripts/testing/machine-budget.ts`. The "real" worker sizing for `npm test` is passed on the CLI by `scripts/testing/run-suite.ts` and overrides everything here. The defaults in this file (`2` workers, `1400 MB`) are deliberately small fallbacks for ad-hoc runs (`npx jest --onlyChanged`, IDE gutter, single file).
- `workerIdleMemoryLimit` must be **above** a worker's steady-state baseline; setting it lower causes Jest to recycle every worker after each file, which is slower than the memory it saves.
- The `.env` is read with `parseEnv` deliberately, **not** `process.loadEnvFile()`, because the latter merges into `process.env` and would hand real rate limits to workers before `tests/support/setup.ts` can raise them—causing 429s in concurrency suites.
- `clearMocks: true` is set globally; individual tests that need a mock to persist must re-establish it.
- The `transformIgnorePatterns` regex is intentionally unanchored (`.*?:`) because `@noble/hashes` can land in a nested unhoisted copy under its parent package.
