# jest.config.mutation.js

## Purpose

Jest configuration consumed exclusively by Stryker mutation testing (`npm run test:mutation`). It exists to swap the ts-jest transform for `@swc/jest` so that Stryker's repeated in-process runs don't accumulate ts-jest's TypeScript LanguageService cache in memory, which would OOM the worker. The mutation run is the primary quality signal for the test suite; the coverage floors in `jest.config.js` are only a fast proxy.

## Key elements

- **`baseConfig`** — `require('./jest.config')`; the shared base this file extends.
- **`preset: undefined`** — explicitly nullifies the ts-jest preset inherited from the base so no ts-jest transform is re-installed under a different key.
- **`maxWorkers: 1`** — forces a single Jest worker per Stryker runner. Stryker's `STRYKER_CONCURRENCY` is the only intended parallelism axis; the base config's `logicalCPUs - 2` would be *multiplied* by Stryker's runner count, causing context-switch thrash (measured: load 31.8, ~55 s/mutant on 32 cores vs. 78 s for the whole suite single-threaded).
- **`transform`** — replaces the ts-jest entry with `@swc/jest`, configured for TypeScript syntax, `es2022` target, and CommonJS module output (so dynamic `import()` calls work under Jest's CJS runtime).

## Relationships

- **`jest.config.js`** — sole graph neighbor. This file spreads it as its base and overrides `preset`, `maxWorkers`, and `transform`. Everything else (test paths, coverage settings, reporters, etc.) is inherited unchanged.

## Notes

- **`import type` is mandatory.** swc transpiles file-by-file with no cross-file type knowledge. A type-only import written as a plain `import` will emit a real `require()` for a symbol that doesn't exist at runtime. The codebase already enforces this via `verbatimModuleSyntax` in `tsconfig.json`; keep it that way.
- **No type-safety cost.** `npm run ts-check` runs once before mutation testing. A mutant changes an expression, not a signature, so per-mutant re-type-checking is pure overhead.
- **Frontend mirror.** The equivalent config on the frontend lives at `vitest.config.mutation.ts` for the same reason.
- **`coverageAnalysis: "perTest"`** (inherited) narrows each mutant to the tests that actually reach it, which is why a single worker is sufficient — there is no sub-file parallelism to exploit.
