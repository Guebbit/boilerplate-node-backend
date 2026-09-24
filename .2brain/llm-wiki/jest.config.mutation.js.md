---
source: jest.config.mutation.js
sha256: a7e31ba8338f8f2db25b75eb171a82088c13d0aebc7be3c3126f3a5dabc979ef
generated_at: 2026-09-23T17:15:27.394854+00:00
model: ollama:qwen3.8:27b
---

# jest.config.mutation.js

## Purpose

A Jest configuration dedicated to Stryker mutation testing (`npm run mutation`, `npm run mutation:full`). It swaps the ts-jest transform for `@swc/jest` (transpile-only, no type-check) and collapses the worker pool to one, avoiding the OOM that ts-jest's LanguageService cache causes when Stryker spawns many parallel Jest runs.

## Key elements

- **`module.exports`** — Spreads `jest.config.js` then overrides three things:
    - `preset: undefined` — removes the ts-jest preset that would reinstall the type-checking transform this file exists to replace.
    - `maxWorkers: 1` — Stryker already runs `concurrency` full Jest processes in parallel (tuned via `STRYKER_CONCURRENCY` in `.env`); multiplying that by the base config's `CPUs - 2` workers would oversubscribe the machine.
    - `transform` — spreads the base transform (preserving the `babel-jest` entry for ESM-only `@scure`/`@noble` packages) then overrides the `^.+\\.tsx?$` matcher with `@swc/jest` configured for TypeScript syntax, `es2022` target, and CommonJS module output.

## Relationships

- **`jest.config.js`** — Required as `baseConfig` at the top of this file; every setting here is a spread-over-override of that config. Changes to the base config's `transform`, `testMatch`, or other keys flow through automatically unless explicitly overridden here.

## Notes

- Type-checking is intentionally **not** performed here; `npm run ts-check` covers that in a separate step.
- The `transform` override spreads `baseConfig.transform` _first_ so the non-TypeScript (babel-jest) entry survives; only the `tsx?` key is replaced.
- The SWC `module: { type: 'commonjs' }` setting downlevels dynamic `import()` calls for Jest's CJS runtime — don't remove it without confirming the target still supports CJS interop.
- Worker count is deliberately 1; increasing it here will multiply against Stryker's own concurrency and likely OOM. Adjust `STRYKER_CONCURRENCY` instead.
- For full rationale, see `docs/tools/mutation-testing.md` (and its `#the-worker-pool-multiplication` anchor).
