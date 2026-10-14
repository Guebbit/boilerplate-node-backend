---
source: scripts/eslint/no-hardcoded-user-text.ts
sha256: da676f32d95d46ce89f8c99014db9fef9e8060e66d0ddf133805d2d57cfde19b
generated_at: 2026-10-14T07:18:50.876743+00:00
model: ollama:qwen3.8:27b
---

# scripts/eslint/no-hardcoded-user-text.ts

## Purpose

Custom ESLint rule that enforces user-facing error copy must originate from an i18n dictionary rather than being hardcoded at the call site. It specifically targets the `errors` argument of `rejectResponse` and `generateReject`, flagging string literals (and expression-free template literals) where a `t(…)` lookup is expected.

## Key elements

- **`CARRIERS`** – `Set(['rejectResponse', 'generateReject'])`; the only two functions whose `errors` argument is inspected.
- **`isLiteralText(node)`** – Type-guard that returns `true` for `StringLiteral` nodes and for `TemplateLiteral` nodes with zero expressions.
- **`noHardcodedUserText`** – The exported rule (created via `ESLintUtils.RuleCreator.withoutDocs`). On `CallExpression` it:
  1. Checks the callee against `CARRIERS`.
  2. Finds the `ArrayExpression` among the call's arguments.
  3. Walks each element: reports bare literals directly, or descends into object properties and reports the `message:` value if it is a literal.
- **`Options` / `MessageIds`** – Type parameters; the rule takes no options and reports a single message id `'literal'`.

## Relationships

- **`scripts/eslint/index.ts`** – The plugin entry point that aggregates and exports `noHardcodedUserText` so projects can enable it via `.eslintrc` / `eslint.config`.
- **`tests/unit/scripts/eslint/no-hardcoded-user-text.test.ts`** – Unit tests exercising the rule's `RuleTester` cases (valid/invalid snippets).

## Notes

- Only the **`errors`** argument is inspected. The envelope's `message` field (derived by `resolveErrorMessage`) is out of scope by design.
- `code:` identifiers, log/audit strings, span names, and `throw new Error(…)` messages are **intentionally not flagged** — they are technician-facing by convention.
- An expression-free template literal (`` `foo` ``) is treated the same as a string literal; a template *with* expressions (`` `Count: ${n}` ``) is allowed.
- The rule uses `ESLintUtils.RuleCreator.withoutDocs`, so no `meta.docs.recommended` / `url` fields are present.
