---
source: tsconfig.jest.json
sha256: a59684198238ed13bfc9d679b5c819f05e7371b64e9c5ccea2e51b6affbdabaa
generated_at: 2026-09-23T20:32:40.814332+00:00
model: ollama:qwen3.8:27b
---

# tsconfig.jest.json

## Purpose

Jest-specific TypeScript configuration that overrides the base `tsconfig.json` so that ts-jest can compile the project under CommonJS. It resolves two conflicts between the app's bundler-style module settings and Jest's CJS runtime.

## Key elements

- **`"extends": "./tsconfig.json"`** — inherits all compiler options from the base config, overriding only what Jest needs.
- **`"module": "node16"` / `"moduleResolution": "node16"`** — required so the CJS resolver understands subpath exports (e.g. `@opentelemetry/semantic-conventions/incubating`). Without this, `src/app.ts` is unimportable from tests.
- **`"verbatimModuleSyntax": false`** — relaxes the base config's type-only-import requirement; ts-jest transpiles per-file and does not need the bundler guarantee.

## Relationships

- **`tsconfig.json`** (parent) — this file inherits and overrides its `compilerOptions`.
- **`jest.config.js`** — sets `diagnostics.ignoreCodes` to suppress the ts-jest `isolatedModules` warning that `node16` module kind triggers; see Notes.
- **`tests/unit/services/products.test.ts`** — contains the `await import(...)` whose downlevelling to `require` would break if `isolatedModules` were enabled.

## Notes

- **Do not add `isolatedModules: true`.** ts-jest would stop downlevelling `await import(...)` to `require`, breaking dynamic imports under Jest's CJS VM. The accompanying ts-jest warning is intentional noise and is already suppressed via `diagnostics.ignoreCodes` in `jest.config.js`.
- The `node16` resolution choice is not cosmetic: switching to `commonjs` or `node` will make subpath-export imports (e.g. `@opentelemetry/semantic-conventions/incubating`) unresolvable, causing test failures at import time.
