---
source: jest.config.mutation.js
sha256: 98b9d3ead04fe5f89464762bdf563e70c1ed82aa9b76133461a40ede2d132cea
generated_at: 2026-09-27T13:48:38.668682+00:00
model: ollama:qwen3.8:27b
---

# jest.config.mutation.js

## Purpose

Jest configuration used **only** during Stryker mutation-test runs (`npm run mutation`, `npm run mutation:full`). It overrides the base `jest.config.js` to swap ts-jest for transpile-only `@swc/jest` and collapse the worker pool to one, preventing the LanguageService cache from growing per-mutant until the worker is OOM-killed. Type-checking is delegated to the separate `npm run ts-check` script.

## Key elements

- **`module.exports`** — the config object; spreads `baseConfig` first, then overrides specific keys.
- **`preset: undefined`** — removes the ts-jest preset inherited from the base config so it no longer injects the ts-jest transform.
- **`testEnvironment`** — absolute path (`path.join(__dirname, 'tests/support/test-environment.ts')`) instead of the `<rootDir>/…` token; Stryker's jest-runner reads this via `readInitialOptions` which does **not** expand `<rootDir>`.
- **`maxWorkers: 1`** — Stryker already runs `concurrency` Jest processes in parallel; the base config's `CPUs − 2` would multiply rather than reuse.
- **`transform['^.+\\.tsx?$']`** — `@swc/jest` with `target: es2022`, `module: commonjs`, `parser: typescript`. Transpiles only; no type-check.
- **`transform` spread order** — `...baseConfig.transform` is spread first so the base config's `.js` (babel-jest) entry for ESM-only packages (`@scure`, `@noble`) is preserved.

## Relationships

- **`jest.config.js`** — imported via `require('./jest.config')` and spread as the base. Every key the base config sets (`preset`, `maxWorkers`, `transform`, `testEnvironment`) is intentionally overridden here. This file exists solely as a mutation-test-specific delta on top of that base.

## Notes

- Never used by regular `jest` / `npm test` runs; only Stryker references it.
- The `<rootDir>` workaround is a Stryker jest-runner quirk (`readInitialOptions` skips `normalize()`), not a Jest limitation per se.
- `STRYKER_CONCURRENCY` in `.env` is the single knob controlling how many Jest processes Stryker spawns concurrently.
- Full rationale and pool-multiplication math live in `docs/tools/mutation-testing.md`.
