---
source: scripts/eslint/index.ts
sha256: 5331b84be438e08641781003d34f1a9957a94eebb1b75d1a3341c1713c96ac67
generated_at: 2026-09-23T17:27:06.688267+00:00
model: ollama:qwen3.8:27b
---

# scripts/eslint/index.ts

## Purpose

Barrel file that aggregates all project-local ESLint custom rules into a single default export. It exists so `eslint.config.ts` can import the entire rule set in one place, and so each rule's reason for not being a built-in or plugin rule is documented in one location.

## Key elements

- **`default` export (object)** — Maps the five custom rule names (`barrel-allowed-sources`, `comment-links`, `controller-chain-must-catch`, `no-hardcoded-user-text`, `no-persistence-imports`) to their respective rule implementations imported from sibling files.
- **Import statements** — One per rule, pulling each implementation from its dedicated sibling module (e.g. `./controller-chain-must-catch`).

## Relationships

- **`eslint.config.ts`** — Consumes the default export of this file to register the custom rules in the flat-config rule set.
- **`scripts/eslint/barrel-allowed-sources.ts`** — Imported and re-exported as the `barrel-allowed-sources` rule.
- **`scripts/eslint/comment-links.ts`** — Imported and re-exported as the `comment-links` rule.
- **`scripts/eslint/controller-chain-must-catch.ts`** — Imported and re-exported as the `controller-chain-must-catch` rule.
- **`scripts/eslint/no-hardcoded-user-text.ts`** — Imported and re-exported as the `no-hardcoded-user-text` rule.
- **`scripts/eslint/no-persistence-imports.ts`** — Imported and re-exported as the `no-persistence-imports` rule.

## Notes

- One file per rule is intentional so each can be unit-tested in isolation with `RuleTester` (see `tests/unit/scripts/eslint/`).
- The rules live in this repo rather than a published plugin package because they encode single-repo conventions with exactly one consumer.
- `controller-chain-must-catch` and `no-hardcoded-user-text` are custom specifically because they inspect AST structure (not text), avoiding false positives from template literals, comments, or quoted strings that a grep-based check would produce.
- `no-persistence-imports` is custom because `no-restricted-imports` only sees the module specifier, not the imported binding name, so barrel imports would hide violations.
- `barrel-allowed-sources` is custom because `eslint-plugin-boundaries` governs file-to-file import edges, whereas this rule governs which _exports_ a module's own `index.ts` is allowed to re-publish.
