---
source: tsconfig.json
sha256: fb97ca8aef72d203ac757eb32e616b63f1046ca4896a1dd61ec58778ea8c0306
generated_at: 2026-09-23T20:32:49.979416+00:00
model: ollama:qwen3.8:27b
---

# tsconfig.json

## Purpose

Root TypeScript compiler configuration for the project. Defines compilation targets, path aliases, strictness settings, and the set of files included in type-checking. It is consumed by the TypeScript compiler, IDEs, and any tooling that resolves project types.

## Key elements

- **`target` / `lib` / `module`** — Emits ES6-compatible code against the ES2023 standard library, using ES2020 module semantics.
- **`paths`** — Maps 9 alias prefixes (`@types`, `@api/*`, `@tests/*`, `@app/*`, `@infrastructure/*`, `@kernel/*`, `@modules/*`, `@scenarios/*`) to concrete directories, enabling short, stable import specifiers throughout the codebase.
- **`strict: true`** — Enables all strict-family checks (`strictNullChecks`, `noImplicitAny`, etc.).
- **`composite: true` + `noEmit: true`** — Marks the project as a composite (eligible for project references) while suppressing actual JS output; the compiler is used for type-checking and declaration-map resolution only.
- **`moduleResolution: "bundler"`** — Resolves modules using the bundler strategy (respects `exports`/`imports` in `package.json`, allows extensionless/relative imports without explicit `.ts`).
- **`verbatimModuleSyntax: true`** — Requires `import type { … }` for type-only imports; mixed value/type imports are forbidden.
- **`typeRoots`** — Adds `./src/types` alongside `node_modules/@types` as locations for ambient type packages.
- **`types: ["node", "jest"]`** — Restricts automatic global type inclusion to these two packages.
- **`include`** — Enumerates the file globs the compiler will process (`api/`, `src/`, `tests/`, `scenarios/`, `scripts/`, `shared/contracts/`).
- **`exclude`** — Excludes `node_modules`.

## Relationships

No graph neighbors are recorded for this file. It is a top-level configuration consumed by tooling rather than imported by source modules.

## Notes

- `composite: true` without `noEmit` would normally require a matching `outDir` emit; here `noEmit` takes precedence, so the flag effectively only enables project-reference bookkeeping.
- `noPropertyAccessFromIndexSignature: false` is set explicitly, meaning dot-access on index-signature types is permitted despite strict mode.
- Because `verbatimModuleSyntax` is active, any `import { SomeType } from …` where `SomeType` is type-only will produce a compile error — use `import type`.
- Path aliases are **not** resolved automatically by bundlers or Node at runtime; a corresponding alias configuration in the bundler/runtime loader is required for actual execution.
- The `include` list omits root-level `.ts` files outside the listed globs (e.g., a stray `helper.ts` in the project root would not be type-checked).
