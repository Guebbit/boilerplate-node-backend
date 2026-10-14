---
source: scripts/eslint/no-persistence-imports.ts
sha256: 531bc0ba0a6c8999b96ba994e8ce21ed095752e9e23f995a14d501572d098d8b
generated_at: 2026-10-14T07:19:05.478331+00:00
model: ollama:qwen3.8:27b
---

# scripts/eslint/no-persistence-imports.ts

## Purpose

A custom ESLint rule that enforces the "single door" boundary for persistence: only `repository.ts` may touch a collection's model or repository. It flags any `ImportDeclaration` in other files that reaches a persistence handle by name suffix (e.g. `userModel`, `userRepository`) or by module path (e.g. `../model`, `@modules/users/repository`), preventing schema coupling from leaking into services, controllers, or utilities.

## Key elements

- **`RuleOptions`** – the single config object: `bindings` (list of name suffixes to flag, default `['Repository', 'Model']`) and `paths` (whether the path-based check runs, default `true`).
- **`PERSISTENCE_PATH`** – regex `/(^|\/)(model|repository)$/` that matches specifiers whose last path segment is exactly `model` or `repository`, anchored on a `/` or start-of-string boundary.
- **`specifierNames`** – helper that returns both the local binding name *and* the original imported name from an `ImportSpecifier`, so aliased imports (`userModel as Users`) are still caught.
- **`noPersistenceImports`** – the exported rule (via `ESLintUtils.RuleCreator.withoutDocs`). Visits `ImportDeclaration` nodes, runs the path check first (reporting once on the source node and short-circuiting), then falls through to the per-specifier binding-suffix check.

## Relationships

- **`scripts/eslint/index.ts`** – registers / re-exports `noPersistenceImports` so it is available as a plugin rule in the project's ESLint config.
- **`tests/unit/scripts/eslint/no-persistence-imports.test.ts`** – unit tests exercising the rule's path check, binding check, alias handling, `import type` inclusion, and config variations.

## Notes

- **`import type` is not exempted.** The rule treats type-only imports as violations because the type *is* the schema; the coupling survives erasure.
- **Path check short-circuits the binding check.** A single `import { userModel } from './model'` produces one `path` report, not two — avoiding duplicate diagnostics on the same line.
- **The regex anchors on a segment boundary** so that shared helpers like `@infrastructure/persistence/base-repository` are *not* flagged; a bare `endsWith('repository')` would false-positive on them.
- **Defaults are the strict reading.** Turning the rule on with no options enables both checks with `['Repository', 'Model']`; a layer that needs a looser policy must opt in explicitly via `bindings` or `paths`.
