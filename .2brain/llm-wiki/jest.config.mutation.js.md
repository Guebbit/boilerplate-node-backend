---
source: jest.config.mutation.js
source_sha256: 54a480120a8ca763f656bb38c01c0f91b90c2b96341c286f39072cf19e623208
context_sha256: 8ea95f727d77948c02c8d90cb96666bb2427991c9f00ea2f2fd7d93634df776d
generated_at: 2026-11-22T01:36:06.502198+00:00
model: claude-code:claude-sonnet-5-5
---

# jest.config.mutation.js

## Purpose
Jest config used only by Stryker (`npm run mutation`, `npm run mutation:full`). It takes `jest.config.js` and replaces ts-jest with `@swc/jest`, and it collapses the worker pool to one worker. ts-jest type-checks, and its LanguageService cache grows with every mutant until the worker is OOM-killed. swc only transpiles, so it retains nothing. Types are already checked once by `npm run ts-check`.

## Key elements
- **Default export**: `{ ...baseConfig, ... }`, the base config with these overrides:
  - `preset: undefined`: removes the ts-jest preset that installs the transform being replaced.
  - `testEnvironment`: an absolute path built with `path.join(__dirname, 'tests/support/test-environment.ts')`.
  - `maxWorkers: 1`: Stryker is already the pool.
  - `workerIdleMemoryLimit: undefined`: dropped along with the pool.
  - `testTimeout: 120_000`: four times the base config's 30 s.
  - `transform`: spreads `baseConfig.transform`, then replaces only the `^.+\\.tsx?$` entry with `@swc/jest`.
- **swc options**: `jsc.parser.syntax: 'typescript'`, `jsc.target: 'es2022'` and `module.type: 'commonjs'`. There is no type-check.

## Relationships
- Requires `jest.config.js` and spreads it. Anything not overridden here is inherited from it.
- It relies on the base config's `transform` having a `.js` entry (babel-jest, for the ESM-only `@scure`/`@noble`), which survives because the base `transform` is spread first.
- It overrides the base config's `testEnvironment` (a `<rootDir>`-relative path) with an absolute path.

## Notes
- **Why `testEnvironment` is absolute**: Stryker's jest-runner reads config with jest-config's `readInitialOptions`, which does not expand `<rootDir>`. A `<rootDir>` path would reach `require.resolve` as a literal, unresolvable segment.
- **Why `workerIdleMemoryLimit` is unset**: the base config only sets it when there are multiple workers. Leaving it on a one-worker run stops Jest running in band.
- **Concurrency**: `STRYKER_CONCURRENCY` in `.env` is the single knob. Stryker runs that many full Jest instances at once.
- **Timeout**: raised because instrumented code under per-test coverage runs slower. One timed-out test in Stryker's initial run fails the whole shard. The file cites a measurement of 2026-10-07 on the generated-basket property in `checkout-money-reconciliation.test.ts`. Hanging mutants are still caught by Stryker's own `timeoutMS`.
