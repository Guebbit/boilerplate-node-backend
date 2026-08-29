# jest.config.mutation.js

## Purpose

Jest configuration consumed exclusively by Stryker (`npm run test:mutation`). It extends the base `jest.config.js` but swaps the ts-jest transform for `@swc/jest` so that repeated in-process Jest invocations (one per mutant) do not accumulate TypeScript LanguageService caches in memory. The goal is to make the mutation run finish without OOM-killing workers.

## Key elements

- **`...baseConfig`** — spreads the shared settings from `jest.config.js` (testMatch, moduleFileExtensions, setup files, etc.), then overrides only what mutation needs.
- **`preset: undefined`** — explicitly clears the ts-jest preset so no ts-jest transform is registered under a different key.
- **`maxWorkers: 1`** — collapses the worker pool. Stryker already runs multiple test runners in parallel (`STRYKER_CONCURRENCY`); nesting a multi-worker pool under each runner multiplies load and memory. One worker per runner keeps the memory budget honest and removes a level of parallelism that `coverageAnalysis: "perTest"` makes unnecessary (each mutant touches only one or two test files).
- **`transform`** — replaces ts-jest with `@swc/jest`:
  - `jsc.parser.syntax: 'typescript'` — strips types, emits JS. No type-checking, no cross-file state.
  - `jsc.target: 'es2022'` — matches the app's compile target.
  - `module.type: 'commonjs'` — downlevels `import()` to `require()` for Jest's CJS runtime.

## Relationships

- **`jest.config.js`** (required via `require('./jest.config')`): this file is a thin overlay. Every setting not explicitly overridden here comes from that file. If the base config adds a new transform, preset, or worker-count assumption, this file must be re-audited to confirm it still makes sense under Stryker's single-process, many-invocation model.

## Notes

- **Type-safety is not lost.** `npm run ts-check` (in `npm run complete`) type-checks the whole project before any mutation run. A mutant changes an expression, not a signature, so per-mutant type-checking would be redundant.
- **`import type` is mandatory.** swc transpiles file-by-file with no cross-file type information; a bare `import { SomeType }` will emit a real `require` for a value that doesn't exist at runtime. The codebase already enforces this via `verbatimModuleSyntax` in `tsconfig.json` — preserve that convention when adding files.
- **Frontend mirror.** `vitest.config.mutation.ts` plays the identical role on the frontend. Keep the two in sync when Stryker or the test-runner setup changes.
- **Tuning knob.** Parallelism lives in `STRYKER_CONCURRENCY` (`.env`), not here. Do not raise `maxWorkers` to "speed things up"; the measured failure mode (4 × 30 workers, load 31.8, ~55 s/mutant vs. 78 s for the whole suite single-threaded) is exactly what this file prevents.
