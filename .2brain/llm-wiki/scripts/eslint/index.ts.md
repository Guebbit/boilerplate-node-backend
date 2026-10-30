---
source: scripts/eslint/index.ts
sha256: 43408c8a62929edbda40bd839fa1c84922f10edb36bc0789a9f95a656cc65424
generated_at: 2026-10-29T01:37:23.578133+00:00
model: ollama:qwen3.8:27b
---

# scripts/eslint/index.ts

## Purpose

Aggregates the six project-local ESLint rules into a single default-exported rule table that `eslint.config.ts` can register under one plugin key. The long header comment documents *why* each rule exists as a custom AST-level rule rather than a built-in, a grep, or a cross-cutting test.

## Key elements

- **Default export** — a plain object (the "rule table") mapping kebab-case rule names to the imported rule implementations:
  - `'barrel-allowed-sources'` → `barrelAllowedSources`
  - `'comment-links'` → `commentLinks`
  - `'controller-chain-must-catch'` → `controllerChainMustCatch`
  - `'friend-members'` → `friendMembers`
  - `'no-hardcoded-user-text'` → `noHardcodedUserText`
  - `'no-persistence-imports'` → `noPersistenceImports`
- **Header doc comment** — per-rule rationale explaining why a built-in rule or text-based check is insufficient for that particular concern.

## Relationships

- **eslint.config.ts** — the sole consumer of this file's default export; it registers the rule table as a local plugin so the six rules appear under their kebab-case names in config.
- **scripts/eslint/barrel-allowed-sources.ts**, **comment-links.ts**, **controller-chain-must-catch.ts**, **friend-members.ts**, **no-hardcoded-user-text.ts**, **no-persistence-imports.ts** — this file is the only importer of each; it re-exports them as a unified table. Each rule file is independently unit-tested via `RuleTester` in `tests/unit/scripts/eslint/`.

## Notes

- Rule names in the exported table are **kebab-case** (matching what you write in `eslint.config.ts`), while the TypeScript imports are **camelCase**. Adding a new rule means a new sibling file, a new import, and a new kebab-case key here.
- The rules intentionally live in this repo (not a published plugin package) because they encode this codebase's layering and naming conventions and have exactly one consumer.
- The header comment is load-bearing documentation: it explains the design trade-offs (AST over text, custom rule over `no-restricted-imports`, etc.) and is meant to be read before modifying or removing any of the six rules.
