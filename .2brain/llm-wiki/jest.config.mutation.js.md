---
source: jest.config.mutation.js
sha256: 409eab11c551a9d2f7acdedb2ed91701c045fd890b579ff0826e252c9f2209af
generated_at: 2026-10-14T06:53:46.596420+00:00
model: ollama:qwen3.8:27b
---

# jest.config.mutation.js

## Purpose

A Jest configuration dedicated to Stryker mutation testing (`npm run mutation`, `npm run mutation:full`). It exists because the default `jest.config.js` uses ts-jest, whose LanguageService cache grows with every mutant until the worker is OOM-killed. This file swaps ts-jest for the transpile-only `@swc/jest` (type-checking is already covered by `npm run ts-check`) and collapses the worker pool to one to avoid multiplicative resource exhaustion under Stryker's own concurrency.

## Key elements

- **`module.exports`** — a single config object that spreads `./jest.config` and overrides:
  - `preset: undefined` — explicitly removes the ts-jest preset so it doesn't re-install the transform being replaced.
  - `testEnvironment` — absolute path to `tests/support/test-environment.ts`. Stryker's jest-runner reads this field via `readInitialOptions` (no `<rootDir>` expansion), so the token form in the base config is unresolvable there.
  - `maxWorkers: 1` — Stryker already runs `concurrency` Jest instances in parallel; the base config's `CPUs - 2` would multiply rather than share.
  - `testTimeout: 120_000` — 4× the base 30 s. Instrumented code runs slower and a single timeout fails the whole Stryker shard.
  - `transform` — spreads the base transform (preserving the babel-jest entry for `.js`), then replaces the `^.+\\.tsx?$` entry with `@swc/jest` configured for `es2022` target and CommonJS output.

## Relationships

- **`jest.config.js`** — required via `require('./jest.config')` as `baseConfig`. All non-overridden settings (testMatch, moduleNameMapper, coverage thresholds, the babel-jest `.js` transform, etc.) are inherited from it. The only field explicitly nullified from the base is `preset`.

## Notes

- Do not add type-dependent logic to test files run under this config; `@swc/jest` skips type-checking entirely.
- The `testEnvironment` override is a workaround for a Stryker jest-runner limitation (see linked issue in the file comment), not a general Jest best practice. Reverting to the `<rootDir>` token will break Stryker runs.
- `STRYKER_CONCURRENCY` in `.env` is the single knob controlling total parallelism; changing `maxWorkers` here should stay at `1`.
- A hanging mutant is still killed by Stryker's own `timeoutMS`, independent of `testTimeout` here.
