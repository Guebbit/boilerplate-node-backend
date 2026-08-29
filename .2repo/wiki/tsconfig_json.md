# tsconfig.json

## Purpose

Root TypeScript compiler configuration for the project. Defines compilation targets, strictness, path aliases, and the set of files TypeScript will check. It exists so the toolchain (editor, lint, test runners, dependency analyzers) has a single authoritative source for module resolution and type-checking rules.

## Key elements

- **`paths`** — Project-internal import aliases: `@types`, `@api/*`, `@tests/*`, `@app/*`, `@infrastructure/*`, `@kernel/*`, `@modules/*`. All resolve under `./src/…` (or `./api/…`, `./tests/support/…`).
- **`composite: true` + `noEmit: true`** — Marks this project as part of a project-references graph while suppressing actual emit; type-checking is the only output.
- **`verbatimModuleSyntax: true`** — Forces explicit `import type` vs. value imports; no elision at compile time.
- **`module: "es2020"` / `moduleResolution: "bundler"`** — ESM-style resolution without a runtime bundler; `.ts` extensionless imports are permitted.
- **`strict: true`** — Full strict null checks, no implicit any, etc.
- **`noPropertyAccessFromIndexSignature: false`** — Dotted access on index-signature types is allowed (opt-out from the stricter default).
- **`typeRoots`** — Local `./src/types` is searched *before* `node_modules/@types`, giving project types priority.
- **`types: ["node", "jest"]`** — Only these global type packages are auto-included.
- **`include` / `exclude`** — Scopes checking to `api/`, `src/`, `tests/`, `db/`, `eslint/`, `scripts/`, `shared/contracts/`; excludes `node_modules`.

## Relationships

- **`tsconfig.jest.json`** — Jest-specific overrides (typically extends this file, may relax `module`/`moduleResolution` for CJS test execution).
- **`eslint.config.ts`** — ESLint's TypeScript parser reads `moduleResolution`, `paths`, and `strict` flags from this file to mirror type-aware lint rules.
- **`dependency-cruiser.cjs`** — Uses the `paths` and `moduleResolution` settings to resolve import specifiers when building the dependency graph.
- **`docs/tools/dependency-graph.md`** — Documents the graph produced by dependency-cruiser; the resolution rules defined here are what make that graph accurate.

## Notes

- `composite: true` normally requires `outDir` and emit, yet `noEmit: true` is set. This works in recent TS versions but means **incremental build artifacts (`.tsbuildinfo`) will not be produced** — don't rely on project-references build order here.
- `moduleResolution: "bundler"` means sub-path `exports` in `package.json` are honored, but classic `node` resolution quirks (e.g. requiring `.js` extensions) do not apply.
- `verbatimModuleSyntax` will **error** on `import { SomeType }` where `SomeType` is only used as a type — use `import type` instead.
- The `noPropertyAccessFromIndexSignature: false` flag is an explicit opt-out; if a future strictness bump is desired, this is the first flag to revisit.
- `outDir: "./dist"` is declared but effectively unused because of `noEmit`; it exists to satisfy `composite` requirements.
