---
source: scripts/eslint/no-persistence-imports.ts
sha256: 86dbd826d85d7b263da0ffb69c4c822197b3954bb511a49cf838bfdf6ebb53e9
generated_at: 2026-11-08T02:51:10.709120+00:00
model: ollama:qwen3.8:27b
---

# scripts/eslint/no-persistence-imports.ts

## Purpose

Custom ESLint rule that enforces the architectural rule "persistence stays behind the repository." It flags imports of persistence handles (by binding-name suffix) or direct imports from `model`/`repository` files (by path), ensuring each collection has exactly one entry point for storage access.

## Key elements

- **`RuleOptions`** — Config interface: `bindings` (array of name suffixes to flag) and `paths` (whether the path check is active).
- **`DEFAULT_BINDINGS`** — `['Repository', 'Model']`; the suffixes matched when no explicit list is provided.
- **`PERSISTENCE_PATH`** — Regex `/(^|\/)(model|repository)$/`; matches import specifiers whose final path segment is exactly `model` or `repository` (segment-boundary anchored to avoid false positives like `base-repository`).
- **`specifierNames`** — Helper returning both the local and original (imported) names of an `ImportSpecifier`, so renames (`userModel as Users`) cannot hide a match.
- **`noPersistenceImports`** — The exported rule (`ESLintUtils.RuleCreator.withoutDocs`). Two message IDs: `binding` (forbidden name) and `path` (forbidden module). `type: 'problem'`.

## Relationships

- **`scripts/eslint/index.ts`** — Registers/exports this rule as part of the project's custom ESLint plugin set.
- **`tests/unit/scripts/eslint/no-persistence-imports.test.ts`** — Unit tests exercising both the binding-suffix and path-check code paths, including rename and `import type` cases.

## Notes

- **`import type` counts.** The rule treats type-only imports the same as value imports because the type *is* the schema; erasure does not remove the coupling.
- **Mutually exclusive per declaration.** If the path check fires, the binding check for that `ImportDeclaration` is skipped — one import, one report, to reduce noise that would encourage disabling the rule.
- **Segment-boundary regex.** `endsWith('repository')` is intentionally *not* used; the anchored regex prevents flagging shared helpers like `@infrastructure/persistence/base-repository`.
- **`withoutDocs`** — The rule carries no `docs.url`; documentation lives in `docs/theory/layers.md#persistence-behind-the-repository` (referenced in the file header comment).
