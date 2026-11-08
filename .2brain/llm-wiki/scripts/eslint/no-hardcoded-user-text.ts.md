---
source: scripts/eslint/no-hardcoded-user-text.ts
sha256: da676f32d95d46ce89f8c99014db9fef9e8060e66d0ddf133805d2d57cfde19b
generated_at: 2026-11-08T02:51:01.644970+00:00
model: ollama:qwen3.8:27b
---

# scripts/eslint/no-hardcoded-user-text.ts

## Purpose

A custom ESLint rule that enforces all user-facing error text in `rejectResponse` and `generateReject` calls comes from an i18n dictionary lookup (`t(…)`) rather than a hardcoded string literal. It exists so that copy added at a call site cannot slip past translation and localization.

## Key elements

- **`CARRIERS`** — A `Set` holding the two function names (`'rejectResponse'`, `'generateReject'`) whose `errors` argument is considered user-facing.
- **`isLiteralText`** — Type guard returning `true` for `StringLiteral` nodes and zero-expression `TemplateLiteral` nodes (i.e., a backtick string with no interpolations).
- **`noHardcodedUserText`** — The exported rule, created via `ESLintUtils.RuleCreator.withoutDocs`. Its `create` handler visits `CallExpression` nodes, resolves the callee name, locates the array argument, and reports any bare string element or any `message:` property whose value is a literal.
- **`Options` / `MessageIds`** — Type parameters: the rule takes no options and emits a single message id (`'literal'`).

## Relationships

- **`scripts/eslint/index.ts`** — Imports `noHardcodedUserText` and registers it in the plugin's rule set so it is available to consumers of the shared ESLint config.
- **`tests/unit/scripts/eslint/no-hardcoded-user-text.test.ts`** — Unit-tests the rule via `RuleTester`, covering accepted patterns (dictionary lookups, `code:` fields, non-carrier calls) and rejected patterns (string literals, empty template literals in the `message` slot).

## Notes

- Scope is intentionally narrow: only the `errors` array argument is inspected. The envelope's `message` field is derived from status by `resolveErrorMessage` and is not a valid target.
- `code:` identifiers, log strings, audit-action names, span names, and thrown `Error` messages are explicitly *not* flagged — they are technician-facing by convention.
- A `TemplateLiteral` with one or more expressions passes; only the zero-expression form (effectively a plain string in backticks) is flagged.
- The rule is typed as `'problem'`, so it is not suppressible via `// eslint-disable` in configs that restrict disable comments to `'suggestion'`/`'layout'` categories.
