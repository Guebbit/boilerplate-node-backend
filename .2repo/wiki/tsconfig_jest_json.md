# tsconfig.jest.json

## Purpose

A Jest-specific TypeScript config that extends the project's base `tsconfig.json` to override module resolution and syntax flags so that ts-jest can correctly transpile and import the application source under Jest's CommonJS runtime.

## Key elements

- **`extends: "./tsconfig.json"`** — inherits all base compiler options; only the fields below are overridden.
- **`module: "node16"` / `moduleResolution: "node16"`** — enables subpath-export resolution (e.g. `@opentelemetry/semantic-conventions/incubating`) that `commonjs`/`node` resolution cannot handle. Without this, importing `src/app.ts` from a test file fails entirely.
- **`verbatimModuleSyntax: false`** — relaxes the base config's bundler-style requirement to mark type-only imports. ts-jest transpiles file-by-file and does not enforce that guarantee.

## Relationships

- **`tsconfig.json`** — parent config; this file inherits all its `compilerOptions` (target, strictness, paths, etc.) and layers the three overrides on top. Any change in the base config is reflected in Jest runs automatically.

## Notes

- **Do not add `isolatedModules: true`.** ts-jest emits a warning suggesting it, but enabling it stops ts-jest from downlevelling `await import(...)` to `require`, breaking dynamic imports under Jest's CJS VM (see `tests/unit/services/products.test.ts`). The warning is suppressed via `diagnostics.ignoreCodes` in `jest.config.js` to avoid a 58-line banner on every pre-commit run.
- The choice of `node16` over `commonjs` is intentional and load-bearing for the OpenTelemetry subpath import; switching back will silently break test imports of `src/app.ts`.
