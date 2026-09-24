---
source: tests/unit/scripts/eslint/no-hardcoded-user-text.test.ts
sha256: 8127364ae3a87114dbf6045c9fda641755d65cf265938f30318d1d98a4558c57
generated_at: 2026-09-23T20:30:47.823117+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/scripts/eslint/no-hardcoded-user-text.test.ts

## Purpose

Unit test for the `no-hardcoded-user-text` ESLint rule. It is deliberately minimal: zero valid cases and a single invalid case. The header comment explains this is because the rule still fires on some inputs, and this file follows the same "one known-bad input, no case table" pattern as `comment-links.test.ts`.

## Key elements

- **`tester`** — `RuleTester` instance configured with `ecmaVersion: 'latest'` and `sourceType: 'module'`.
- **`tester.run('no-hardcoded-user-text', noHardcodedUserText as never, …)`** — Executes the rule test. The `valid` array is empty; `invalid` contains one case: `rejectResponse(response, 404, ['Product not found']);` expecting a single error with `messageId: 'literal'`.

## Relationships

- **`scripts/eslint/no-hardcoded-user-text.ts`** — The rule under test (`noHardcodedUserText`). Imported directly and passed to `RuleTester.run`.

## Notes

- The rule is cast `as never` to bypass a TypeScript type mismatch between the custom rule shape and `RuleTester`'s expected signature.
- The empty `valid` array is intentional (see header comment), not an oversight. If you add valid cases, the rule may still flag them.
- The pattern (one known-bad input, no case table) is shared with `comment-links.test.ts`; check that file if you need context on _why_ the rule fires on otherwise-legitimate code.
