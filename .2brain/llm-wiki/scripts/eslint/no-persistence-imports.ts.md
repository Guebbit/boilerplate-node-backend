---
source: scripts/eslint/no-persistence-imports.ts
sha256: 86dbd826d85d7b263da0ffb69c4c822197b3954bb511a49cf838bfdf6ebb53e9
generated_at: 2026-10-29T01:37:33.962857+00:00
model: ollama:qwen3.8:27b
---

# scripts/eslint/no-persistence-imports.ts

## Purpose

Custom ESLint rule that enforces the "persistence behind the repository" boundary: a collection's model and repository modules are the sole door to its storage shape, and this rule flags any other file that imports a persistence handle (by name suffix) or reaches directly into a `model`/`repository` module (by path). It treats `import type` as a violation too, since the type itself is the schema.

## Key elements

- **`RuleOptions`** — Config block: `bindings` (array of name suffixes to flag) and `paths` (whether the path check runs). Both optional; defaults are the strict reading.
- **`DEFAULT_BINDINGS`** — `['Repository', 'Model']`; used when `bindings` is omitted.
- **`PERSISTENCE_PATH`** — Regex `/(^|\/)(model|repository)$/`; matches a specifier whose final segment is exactly `model` or `repository`, anchored on a `/` boundary so shared helpers like `base-repository` are not matched.
- **`specifierNames`** — Extracts both the local and the imported identifier from an `ImportSpecifier`, so a renamed binding (`userModel as Users`) is still detected.
- **`noPersistenceImports`** — The exported rule (`ESLintUtils.RuleCreator.withoutDocs`). On `ImportDeclaration` it runs the path check first; if the source matches, it reports once and returns. Otherwise it walks specifiers and reports the first binding whose name ends with a configured suffix.

## Relationships

- **`scripts/eslint/index.ts`** — Imports and registers `noPersistenceImports` as part of the project's shared ESLint rule set.
- **`tests/unit/scripts/eslint/no-persistence-imports.test.ts`** — Unit tests exercising the rule's path-check, binding-check, rename, and `import type` cases.

## Notes

- Path and binding checks are **mutually exclusive per declaration**: if the path matches, the rule reports the `path` message and skips the per-specifier name scan, so a single bad import produces one diagnostic, not two.
- The binding check uses `endsWith` on the resolved name (both local and imported), so it catches suffixes like `Repository` / `Model` in any casing variant the project uses; a custom `bindings` array fully replaces the default.
- Setting `bindings` to `[]` disables the name check entirely (the loop is skipped), which is the escape hatch for layers where those suffixes are not meaningful.
- `import type` is intentionally **not** excluded — the rule's rationale (documented in the file header and in `docs/theory/layers.md#persistence-behind-the-repository`) is that the type *is* the schema, so the coupling outlives erasure.
