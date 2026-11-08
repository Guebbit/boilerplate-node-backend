---
source: jest.config.mutation.js
sha256: 2301be6918c592c8fccba509f77d019cf63f2043c912ed2053e8900fa0274b73
generated_at: 2026-11-08T02:25:38.981847+00:00
model: ollama:qwen3.8:27b
---

# jest.config.mutation.js

## Purpose

A Jest configuration override used exclusively by Stryker mutation testing (`npm run mutation`, `npm run mutation:full`). It replaces the ts-jest transform with swc (transpile-only, no type-checking) to prevent the LanguageService cache from growing per-mutant until workers are OOM-killed, and collapses the worker pool to one because Stryker already parallelises jest invocations itself.

## Key elements

- **`module.exports`** — spreads `./jest.config` and overrides the following fields:
  - **`preset: undefined`** — removes the ts-jest preset that installs the transform being replaced.
  - **`testEnvironment`** — absolute path (`path.join(__dirname, 'tests/support/test-environment.ts')`) because Stryker's jest-runner reads `testEnvironment` from the raw, unnormalised config and cannot resolve the `<rootDir>` token.
  - **`maxWorkers: 1`** — Stryker runs `concurrency` full jest processes in parallel; the base config's `CPUs - 2` would be multiplied, not reused.
  - **`workerIdleMemoryLimit: undefined`** — meaningless with a single worker; prevents jest from throttling in-band.
  - **`testTimeout: 120_000`** — 4× the base 30 s; instrumented code under per-test coverage runs slower and a single timeout fails the whole Stryker shard.
  - **`transform`** — spreads the base transform (preserving the babel-jest `.js` entry for `@scure`/`@noble`) and replaces the `^.+\.tsx?$` matcher with `@swc/jest` configured for `es2022` target and CommonJS module output.

## Relationships

- **`jest.config.js`** — Required via `require('./jest.config')` and spread as the base. This file overrides `preset`, `testEnvironment`, `maxWorkers`, `workerIdleMemoryLimit`, `testTimeout`, and one entry in `transform`. All other fields (setupFiles, moduleNameMapper, collectCoverageFrom, etc.) are inherited unchanged.

## Notes

- Type-checking is still enforced separately by `npm run ts-check`; this config deliberately skips it.
- Concurrency is controlled by `STRYKER_CONCURRENCY` in `.env`, not by this file.
- A hanging mutant is still caught by Stryker's own `timeoutMS`, independent of the Jest `testTimeout` set here.
- See `docs/tools/mutation-testing.md` for the full rationale and the worker-pool multiplication explanation.
