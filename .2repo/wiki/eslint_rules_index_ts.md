# eslint/rules/index.ts

## Purpose

Aggregation (barrel) module that collects the project's three local ESLint rules into a single default export, mapping each rule's string name to its implementation object. It exists so that `eslint.config.ts` can register all project-specific rules with one import rather than reaching into three separate files.

## Key elements

- **Default export** — An object with three keys (`'controller-chain-must-catch'`, `'no-hardcoded-user-text'`, `'no-persistence-imports'`), each mapped to the corresponding rule object imported from its sibling file. This shape matches what ESLint's `defineConfig` / plugin convention expects for a local plugin's `rules` property.
- **Imports** — Pulls in `controllerChainMustCatch`, `noHardcodedUserText`, and `noPersistenceImports` from their respective files in the same directory.

## Relationships

- **`eslint/rules/controller-chain-must-catch.ts`** — Provides the `controllerChainMustCatch` rule object consumed by this file's export map.
- **`eslint/rules/no-hardcoded-user-text.ts`** — Provides the `noHardcodedUserText` rule object consumed by this file's export map.
- **`eslint/rules/no-persistence-imports.ts`** — Provides the `noPersistenceImports` rule object consumed by this file's export map.
- **`eslint.config.ts`** — The sole consumer of this module's default export; it registers these rules in the ESLint flat config so they apply project-wide.

## Notes

- The rules live in-repo (not as a published `eslint-plugin-*` package) because they encode this repository's conventions and have exactly one consumer.
- One file per rule is a deliberate convention so each rule can be unit-tested in isolation with `RuleTester` (tests under `tests/unit/eslint/`).
- The file's doc comment explains the historical rationale: the first two rules were previously AST-free text greps / a hand-rolled tokenizer under `tests/cross-cutting/`; the third exists because `no-restricted-imports` cannot inspect imported *names*, only module specifiers, so barrel imports (`{ userRepository } from '@modules/users'`) would slip past it.
