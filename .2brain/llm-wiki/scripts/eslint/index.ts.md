---
source: scripts/eslint/index.ts
sha256: 4949050c3a04120167f8a7ca0b2af68cec1ad238c639abb07d4169e612703ca6
generated_at: 2026-11-14T17:35:13.115604+00:00
model: ollama:qwen3.8:27b
---

# scripts/eslint/index.ts

## Purpose

Aggregates all project-local ESLint rule implementations into a single default export (a rule-name-to-rule object) so that `eslint.config.ts` can register the whole set with one plugin import. It is the entry point for this repo's custom lint rules.

## Key elements

- **`export default` (object literal)** — Maps each rule's kebab-case name (e.g. `'no-persistence-imports'`) to its implementation function. This is the "plugin rule table" that ESLint's flat config consumes.
- **Imports** — Five sibling rule modules, each providing one rule implementation that is referenced by name in the object literal:
  - `barrelAllowedSources` from `./barrel-allowed-sources`
  - `commentLinks` from `./comment-links`
  - `controllerChainMustCatch` from `./controller-chain-must-catch`
  - `noHardcodedUserText` from `./no-hardcoded-user-text`
  - `noPersistenceImports` from `./no-persistence-imports`

## Relationships

- **`eslint.config.ts`** — Primary consumer. Imports this file's default export as a plugin and activates the individual rules by their string names.
- **`scripts/eslint/barrel-allowed-sources.ts`**, **`comment-links.ts`**, **`controller-chain-must-catch.ts`**, **`no-hardcoded-user-text.ts`**, **`no-persistence-imports.ts`** — Each provides one rule implementation that this index re-exports under its canonical name. No logic lives here; it is purely wiring.

## Notes

- The file contains no runtime logic beyond the object literal — all rule behavior lives in the sibling files.
- The JSDoc at the top of the file is the canonical *rationale* for why each rule is custom rather than a built-in or `eslint-plugin-boundaries` rule. If a rule's "why" isn't obvious, start there.
- One file per rule (enforced by convention) so each can be unit-tested independently with ESLint's `RuleTester` in `tests/unit/scripts/eslint/`.
- These rules are intentionally **not** published as a standalone plugin package; they encode this repo's layering and naming conventions and have exactly one consumer.
