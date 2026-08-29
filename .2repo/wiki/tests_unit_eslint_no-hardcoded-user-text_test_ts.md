# tests/unit/eslint/no-hardcoded-user-text.test.ts

## Purpose

Unit test for the `no-hardcoded-user-text` ESLint rule. It verifies that the rule flags bare string literals and `message:` values in the `errors` argument of `rejectResponse` / `generateReject`, while explicitly *not* flagging `code:` identifiers, `t(…)` calls, template literals containing expressions, or unrelated function calls.

## Key elements

- **`tester`** — a `RuleTester` instance configured with `ecmaVersion: 'latest'` and `sourceType: 'module'`. All assertions go through it.
- **`tester.run('no-hardcoded-user-text', noHardcodedUserText as never, { valid, invalid })`** — the single top-level invocation supplying six valid cases and four invalid cases. Each invalid case expects exactly one error with `messageId: 'literal'`.
- **Valid cases** pin down boundaries: `t()`-wrapped strings, `code:` literals, expression-bearing template literals, unrelated calls (`logger.warn`), and calls with no array argument.
- **Invalid cases** cover the three shapes the rule should flag: a bare string element, a `message:` literal, a zero-expression template literal, and a mixed array where one literal sits among valid `t()` entries.

## Relationships

- **`eslint/rules/no-hardcoded-user-text.ts`** — the rule under test. Imported as `noHardcodedUserText` and handed to `RuleTester`. The test exercises exactly the two reject-carrier signatures (`rejectResponse`, `generateReject`) and the `errors` array shape that the rule's AST visitor targets.

## Notes

- `tester.run` is placed at **module top level**, not inside a `describe`/`test` block. `RuleTester` emits its own `describe`/`it` calls; Jest rejects a `describe` nested inside a `test`. Adding a wrapper will break the run.
- The rule parameter is cast `as never` to satisfy `RuleTester`'s overloads — the actual rule object is a standard ESLint rule, the cast is a type-level workaround only.
- A template literal with **no** embedded expressions (`` [`Not found`] ``) is treated as hardcoded copy and *is* flagged; the same template with a `${…}` expression is *not*. This is the one subtle distinction the valid/invalid pair locks in.
