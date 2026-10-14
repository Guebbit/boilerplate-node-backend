---
source: scripts/eslint/index.ts
sha256: 4949050c3a04120167f8a7ca0b2af68cec1ad238c639abb07d4169e612703ca6
generated_at: 2026-10-14T07:18:38.223564+00:00
model: ollama:qwen3.8:27b
---

# scripts/eslint/index.ts

## Purpose

The default export of a local ESLint plugin: a flat map of rule-name strings to their rule implementations. It exists so that `eslint.config.ts` can register five project-specific rules (one per repo convention) as a single plugin object, keeping each rule in its own file for isolated `RuleTester` unit tests.

## Key elements

- **`export default`** — an object whose keys are the rule names used in `eslint.config.ts` and whose values are the imported rule implementations.
- **Imports** — one per rule, each from a sibling file in `scripts/eslint/`:
  - `barrelAllowedSources` → `./barrel-allowed-sources`
  - `commentLinks` → `./comment-links`
  - `controllerChainMustCatch` → `./controller-chain-must-catch`
  - `noHardcodedUserText` → `./no-hardcoded-user-text`
  - `noPersistenceImports` → `./no-persistence-imports`

## Relationships

- **`eslint.config.ts`** — the sole consumer; references the plugin by the rule names defined here (e.g. `'barrel-allowed-sources'`) to wire each rule into the lint pipeline.
- **`scripts/eslint/barrel-allowed-sources.ts`**, **`comment-links.ts`**, **`controller-chain-must-catch.ts`**, **`no-hardcoded-user-text.ts`**, **`no-persistence-imports.ts`** — imported here; each file exports one ESLint rule implementation that this file re-exports under its string key.

## Notes

- The file is intentionally a one-file-per-rule barrel rather than a published plugin package: the rules encode *this* repo's conventions and have exactly one consumer.
- Rule implementations operate on the parsed AST, not on raw source text. The header comment explains why (avoids tokenizer edge-cases like parens inside template literals or `.catch(` appearing in comments).
- `no-persistence-imports` and `barrel-allowed-sources` cannot be expressed with built-in ESLint features (`no-restricted-imports`, `eslint-plugin-boundaries`) because they must inspect the *imported name* or the barrel's own `export` declarations, not just module specifiers or cross-module import edges.
- Unit tests live under `tests/unit/scripts/eslint/` and use `RuleTester`; add a new rule by creating a sibling file, importing it here, and adding its key to the default export.
