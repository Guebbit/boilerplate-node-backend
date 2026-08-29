# eslint/rules/no-hardcoded-user-text.ts

## Purpose

Custom ESLint rule that enforces user-facing error copy must come from an i18n dictionary (`t(…)`) rather than a string literal. It scans calls to `rejectResponse` and `generateReject`, inspects the `errors` array argument, and reports any bare string literal or literal value under a `message:` key.

## Key elements

- **`CARRIERS`** – `Set` of the two function names whose `errors` argument carries user-readable text (`rejectResponse`, `generateReject`).
- **`isLiteralText(node)`** – Returns `true` when a node is a string `Literal` or a `TemplateLiteral` with zero expressions; i.e., text a user would read verbatim.
- **`noHardcodedUserText`** (default export) – The rule object:
  - `meta` – Declares the rule as a `'problem'` type with a single `literal` message template.
  - `create(context)` – Visits `CallExpression` nodes; when the callee matches a carrier and an argument is an `ArrayExpression`, iterates its elements:
    - Bare literal element → report.
    - `ObjectExpression` element → report only if a property's key is `message` and its value is a literal.

## Relationships

- **`eslint/rules/index.ts`** – Aggregates this rule into the project's ESLint plugin/rule set so it can be enabled in the ESLint config.
- **`tests/unit/eslint/no-hardcoded-user-text.test.ts`** – Unit tests that feed fixture source strings through the rule and assert expected/suppressed diagnostics.

## Notes

- Only the *first* argument that is an `ArrayExpression` is inspected; a call shaped like `rejectResponse(response, 422, errors)` targets the `errors` parameter positionally by type, not by index.
- `code:` fields, thrown `Error` messages, log lines, and span names are intentionally **not** flagged—they are technician-facing by convention.
- Expression-less template literals (`` `Server error` ``) are treated identically to string literals and will be reported.
- The envelope-level `message` field is excluded because it is derived from the status code via `resolveErrorMessage` and cannot be a free-form literal at the call site.
