---
source: tests/unit/scripts/eslint/no-hardcoded-user-text.test.ts
sha256: 8127364ae3a87114dbf6045c9fda641755d65cf265938f30318d1d98a4558c57
generated_at: 2026-11-08T10:37:05.720582+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/scripts/eslint/no-hardcoded-user-text.test.ts

## Purpose

Unit test for the `no-hardcoded-user-text` ESLint rule. It verifies that the rule still fires (via its `literal` diagnostic) when a hard-coded user-facing string is passed to `rejectResponse`. The file intentionally contains a single invalid case and no case table, as explained by the header comment and the pattern described in `comment-links.test.ts`.

## Key elements

- **`tester`** – An `eslint.RuleTester` instance configured with `ecmaVersion: 'latest'` and `sourceType: 'module'`.
- **`noHardcodedUserText`** (imported) – The rule under test, imported from `scripts/eslint/no-hardcoded-user-text.ts` and cast `as never` to satisfy `RuleTester`'s type signature.
- **Invalid case** – Asserts that `rejectResponse(response, 404, ['Product not found'])` produces exactly one error with `messageId: 'literal'`.

## Relationships

- **`scripts/eslint/no-hardcoded-user-text.ts`** – Direct import; this file is the sole subject of the test. The rule exported from that file is passed to `RuleTester.run`.

## Notes

- The `valid` array is intentionally empty. The header comment links to `comment-links.test.ts` for the rationale: across four related rule-test files, each carries exactly one known-bad input rather than a full case table, because the rule "still fires" and the minimal repro is sufficient.
- The `as never` cast on the rule is a type-level workaround for `RuleTester`'s generic constraint, not a behavioral change.
