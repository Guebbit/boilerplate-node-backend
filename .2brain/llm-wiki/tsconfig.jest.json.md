---
source: tsconfig.jest.json
sha256: a59684198238ed13bfc9d679b5c819f05e7371b64e9c5ccea2e51b6affbdabaa
generated_at: 2026-11-08T10:45:23.720422+00:00
model: ollama:qwen3.8:27b
---

# tsconfig.jest.json

## Purpose

Jest-specific TypeScript config that extends the project `tsconfig.json` with overrides required for ts-jest's per-file transpilation model. It exists because the app's resolution strategy (bundler-style, subpath exports) and module syntax guarantees are incompatible with ts-jest's CJS VM without explicit adjustments.

## Key elements

- **`extends: "./tsconfig.json"`** — inherits all project compiler options; only the three options below are overridden.
- **`module: "node16"`** — enables Node 16-style resolution so subpath exports (e.g. `@opentelemetry/semantic-conventions/incubating`) resolve correctly. `commonjs`/`node` would not.
- **`moduleResolution: "node16"`** — pairs with the `module` setting; required for the subpath-export lookup described above.
- **`verbatimModuleSyntax: false`** — relaxes the bundler-era requirement that type-only imports be explicitly marked with `import type`. ts-jest transpiles each file in isolation and does not rely on that guarantee.

## Relationships

No graph neighbors are recorded. The file is consumed by ts-jest (invoked via `jest.config.js`), which reads it when transpiling test files.

## Notes

- **Do not add `isolatedModules: true`.** ts-jest emits a warning recommending it, but enabling it stops the downlevelling of `await import(…)` to `require`, breaking dynamic imports in `tests/unit/services/products.test.ts` under Jest's CJS VM. The warning is suppressed via `diagnostics.ignoreCodes` in `jest.config.js` because the unit suite runs from the pre-commit hook (58 lines of banner per test file, every commit).
- The `node16` choice is load-bearing: without it, `src/app.ts` cannot be imported by any test at all due to the subpath-export syntax.
