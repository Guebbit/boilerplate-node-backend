# eslint/rules/no-persistence-imports.ts

## Purpose

A custom ESLint rule that enforces a single-door persistence boundary: only `repository.ts` files may import collection models, schema types, or repository handles. Any other file that reaches past the repository (by binding name or by import path) is flagged, preventing scattered query shapes, lean/hydrated confusion, and unguarded direct DB calls.

## Key elements

- **`noPersistenceImports`** — The exported rule object (ESLint rule API shape with `meta` + `create`). Registered as a `problem`-type rule.
- **`DEFAULT_BINDINGS`** — `['Repository', 'Model']`. Suffixes that flag a binding name when no config option is provided.
- **`PERSISTENCE_PATH`** — `/^(\/)?(model|repository)$/` regex (segment-anchored). Matches import specifiers whose last path segment is exactly `model` or `repository`, catching direct schema imports like `../model` or `@modules/users/model` while excluding shared helpers like `@infrastructure/persistence/base-repository`.
- **`specifierNames()`** — Collects both the `imported` and `local` identifier names from an import specifier so that `import { userModel as Users }` is still caught even though the local alias hides the original name.
- **`meta.schema`** — JSON Schema for the single options object: `{ bindings?: string[], paths?: boolean }`.
- **`create()`** — Returns an `ImportDeclaration` visitor. On each import it first evaluates the path check (report once, then `return` to avoid double-reporting); if the path check doesn't fire it iterates specifiers and matches names against the configured suffixes.

## Relationships

- **`eslint/rules/index.ts`** — Aggregates and re-exports `noPersistenceImports` so the project's ESLint config can reference it by name.
- **`tests/unit/eslint/no-persistence-imports.test.ts`** — Unit tests exercising the rule's `ImportDeclaration` visitor via the ESLint RuleTester harness (path hits, binding hits, `import type` cases, alias evasion, default-vs-configured options).

## Notes

- **One report per import, not two.** When the path check fires the visitor `return`s immediately, so `import { userModel } from './model'` produces a single `path` diagnostic rather than a `path` + `binding` pair. This is deliberate: two reports on one line is how a rule gets `disabled` in a quick fix.
- **`import type` is not exempt.** The rule treats type-only imports the same as value imports; the reasoning is that the type *is* the schema, so the coupling outlives erasure.
- **Suffix matching, not exact matching.** A binding ending in `Repository` or `Model` is flagged; a binding like `BaseRepositoryHelper` would also match. The default list is intentionally short; per-layer overrides go in the ESLint config's `bindings` array.
- **Defaults are the strict reading.** Turning the rule on with no options means both checks are active and both default suffixes apply.
