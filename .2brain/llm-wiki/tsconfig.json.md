---
source: tsconfig.json
sha256: bd0eef688b9da9834196ac4194e7ab62e118627377f5bb9710cb412abdd73de6
generated_at: 2026-11-08T10:45:32.988630+00:00
model: ollama:qwen3.8:27b
---

# tsconfig.json

## Purpose

Root TypeScript compiler configuration for the project. It defines compilation targets, module resolution strategy, strictness rules, and path aliases that let imports use short `@-prefixed` names instead of relative paths. It also scopes which files the compiler considers part of the project.

## Key elements

- **`target` / `lib` / `module`** — Output targets ES6 syntax, uses the ES2023 standard library, and treats files as ES2020 modules.
- **`paths`** — Maps `@types`, `@api/*`, `@tests/*`, `@app/*`, `@infrastructure/*`, `@kernel/*`, `@modules/*`, `@scenarios/*`, and `@domain-primitives/*` to their respective directories under `./src`, `./api`, `./tests`, or `./scenarios`.
- **`strict: true`** — Enables all strict-family checks (null-checks, no-implicit-any, etc.).
- **`composite: true` + `noEmit: true`** — Marks this as a project-references participant while telling the compiler not to emit files (type-check / tooling only).
- **`verbatimModuleSyntax: true`** — `import` vs `import type` must be written explicitly; the compiler does not rewrite them.
- **`moduleResolution: "bundler"`** — Resolves modules the same way bundlers (Vite, esbuild, etc.) do, rather than Node's CJS/ESM resolution.
- **`esModuleInterop` / `resolveJsonModule`** — Allows default-importing CJS packages and importing `.json` files as typed modules.
- **`types` / `typeRoots`** — Only `node` and `jest` ambient types are auto-included; lookups start in `./src/types` before falling back to `node_modules/@types`.
- **`include` / `exclude`** — Pulls in `api`, `src`, `tests`, `scenarios`, `scripts`, `shared/contracts`, `shared/locales`, and `package.json`; excludes `node_modules`.

## Relationships

No graph neighbors are listed; this file is a leaf configuration consumed by the TypeScript compiler, editors, and build tooling rather than imported by other source files.

## Notes

- `noEmit: true` means running `tsc` here will never produce `./dist` output despite `outDir` being set. The `outDir` value is effectively inert unless another tool (e.g., a bundler) reads it.
- `composite: true` normally *requires* `noEmit: false`; the combination here is only valid because the project is used purely for type-checking / project-references metadata, not for emitting.
- `noPropertyAccessFromIndexSignature` is explicitly set to `false`, overriding the "strict" default — index-signature properties are accessible via dot notation.
- `skipLibCheck: true` suppresses errors inside `.d.ts` files; real type errors in your own code are still reported.
- Path aliases starting with `@` are **not** auto-resolved by Node at runtime; a bundler or the TS compiler must translate them.
