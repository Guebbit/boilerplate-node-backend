---
source: scripts/eslint/index.ts
sha256: 43408c8a62929edbda40bd839fa1c84922f10edb36bc0789a9f95a656cc65424
generated_at: 2026-11-08T02:50:52.066016+00:00
model: ollama:qwen3.8:27b
---

# scripts/eslint/index.ts

## Purpose

Barrel file that assembles the project's custom ESLint rules into a single rule table (rule name → implementation). It exists so `eslint.config.ts` can register all repo-specific rules in one place without importing each rule file individually.

## Key elements

- **Default export** — an object mapping six kebab-case rule names (`barrel-allowed-sources`, `comment-links`, `controller-chain-must-catch`, `friend-members`, `no-hardcoded-user-text`, `no-persistence-imports`) to their implementation objects. The keys are the names used in `eslint.config.ts` and in inline `eslint-disable` comments.
- **Imports** — one `import` per sibling rule module in `scripts/eslint/`, each providing a single rule implementation object.

## Relationships

- **`eslint.config.ts`** — consumes this file's default export as the rule table for the plugin. This file is the sole bridge between the rule implementations and the ESLint config.
- **`scripts/eslint/barrel-allowed-sources.ts`**, **`comment-links.ts`**, **`controller-chain-must-catch.ts`**, **`friend-members.ts`**, **`no-hardcoded-user-text.ts`**, **`no-persistence-imports.ts`** — each exports one rule; this file re-exports them under their kebab-case names.

## Notes

- The rule names in the default export are kebab-case (matching ESLint's naming convention for plugin rules), while the imported symbols are camelCase.
- Rules live in this repo rather than a published plugin package because they encode this repo's specific layering and naming conventions and have exactly one consumer.
- The JSDoc at the top of the file documents *why* each rule is custom rather than achievable via `no-restricted-imports`, `eslint-plugin-boundaries`, or a cross-cutting test. Worth reading before adding a new rule to the table.
- Each rule is expected to be unit-tested with `RuleTester` in `tests/unit/scripts/eslint/`.
