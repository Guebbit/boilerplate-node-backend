---
source: scripts/eslint/no-hardcoded-user-text.ts
source_sha256: 438cbce2fce62f3b5a2f88512bb8a97b9599bebd78e4e56a7914bc3191ccd981
context_sha256: d58176bbb19aefdb3804c651290f23e103b554d3c4c05cb1ee83283ee79aa2aa
generated_at: 2026-11-22T02:06:19.476913+00:00
model: claude-code:claude-sonnet-5-5
---

# scripts/eslint/no-hardcoded-user-text.ts

## Purpose
A custom ESLint rule that forbids hardcoded user-facing copy in error responses. The text a user reads comes from the `errors` argument of `rejectResponse` and `generateReject`, because the envelope's own `message` is derived from the status by `resolveErrorMessage` and cannot be passed. The rule ensures that text comes from a dictionary (`t(…)`) rather than a literal at the call site.

## Key elements
- `noHardcodedUserText`: the exported rule, built with `ESLintUtils.RuleCreator.withoutDocs`. It is type `problem`, takes no options, and reports a single message ID, `literal`. The message names the offending callee.
- `CARRIERS`: set of watched function names (`rejectResponse`, `generateReject`).
- `isLiteralText`: type guard that is true for a string `Literal`, or a `TemplateLiteral` with no expressions.
- `create` visitor: on each `CallExpression` whose callee is a plain identifier in `CARRIERS`, it takes the first array-expression argument as the `errors` list, then inspects each element:
  - A bare literal-text element is reported.
  - An object element has its `message` property reported if the value is literal text. The key may be an identifier `message` or a string literal `'message'`.

## Relationships
- `scripts/eslint/index.ts` is the neighboring module in the same directory. It is the likely place where this rule is exported and registered, but that wiring isn't visible in this file.
- `tests/unit/scripts/eslint/no-hardcoded-user-text.test.ts` is the unit test for this rule.

## Notes
- Deliberately not flagged: `code:` identifiers, log lines, audit actions, span names and thrown `Error` messages, which are technician-facing.
- Only direct identifier calls are matched. Member calls such as `obj.rejectResponse(...)` are ignored.
- Only the first array argument is checked. Elements that are variables, function calls (e.g. `t(...)`) or templates with expressions pass.
- Spread elements and non-`message` properties are skipped.
