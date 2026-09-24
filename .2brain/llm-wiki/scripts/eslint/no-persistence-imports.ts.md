---
source: scripts/eslint/no-persistence-imports.ts
sha256: 727ff26cac2db01da6f7b0fa70ce835756eb5ae8bca1ad391fce4a81579b2262
generated_at: 2026-09-23T17:27:29.042999+00:00
model: ollama:qwen3.8:27b
---

# scripts/eslint/no-persistence-imports.ts

## Purpose

Custom ESLint rule that enforces a single-door persistence boundary: outside its own repository file, no module may import a repository/model handle by name _or_ import directly from a `model`/`repository` file. It exists so that schema coupling (mongoose document shapes, query builders) stays isolated behind `repository.ts`, preventing field renames from cascading and keeping services/controllers ignorant of storage layout.

## Key elements

- **`RuleOptions`** — interface accepting `bindings?: string[]` (name suffixes to flag) and `paths?: boolean` (toggle the path check).
- **`DEFAULT_BINDINGS`** — `['Repository', 'Model']`; used when the rule is enabled without options.
- **`PERSISTENCE_PATH`** — `/(^|\/)(model|repository)$/`; regex that matches the _last_ path segment, deliberately anchored so `base-repository` is not flagged.
- **`specifierNames(specifier)`** — returns both the local and the imported identifier for an import specifier, so `userModel as Users` is caught on either name.
- **`noPersistenceImports`** (exported) — the rule itself, built with `ESLintUtils.RuleCreator.withoutDocs`. On each `ImportDeclaration` it first tests the source against `PERSISTENCE_PATH`; if that matches it reports once on the source node and returns. Otherwise it walks specifiers and reports any whose name ends with a configured suffix.

## Relationships

- **`scripts/eslint/index.ts`** — registers `noPersistenceImports` in the project's shared ESLint plugin / rule collection, making it available to other packages' configs.
- **`tests/unit/scripts/eslint/no-persistence-imports.test.ts`** — unit-test suite that exercises both the binding and path message paths, including the `import type` case and the `as`-rename case.

## Notes

- `import type` is **not** exempted. The file's header explains the rationale: the type _is_ the schema, so the coupling survives erasure and the rule would be gamed away if type imports were allowed.
- When the path check fires, the rule **returns immediately** after reporting, skipping the name check. This guarantees exactly one report per offending `import` line, reducing the temptation to disable the rule.
- Both the local binding and the imported name are checked, so `import { userModel as Users }` is still flagged via `Users`-independent matching on `userModel`.
- Defaults are the **strict** reading (`paths: true`, both suffixes active). A config that simply enables the rule without options is never implicitly lax.
