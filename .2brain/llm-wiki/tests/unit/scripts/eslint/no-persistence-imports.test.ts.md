---
source: tests/unit/scripts/eslint/no-persistence-imports.test.ts
sha256: 89e3384dee940d34d3487150ac8f486caa621351bb10209ea76bf19234c5fee9
generated_at: 2026-09-23T20:30:56.777843+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/scripts/eslint/no-persistence-imports.test.ts

## Purpose

Unit test for the `noPersistenceImports` ESLint rule, focused exclusively on the **binding-name** detection path. It exists to verify that a barrel import (e.g. `@modules/users`) is still flagged when the imported identifier matches a configured binding, even though the specifier path itself is non-descriptive.

## Key elements

- **`STRICT`** – Shared options object (`{ bindings: ['Repository', 'Model'], paths: true }`) that enables both halves of the rule so the single bad input isolates the binding match.
- **`tester`** – `eslint.RuleTester` instance configured for ES modules.
- **`tester.run('no-persistence-imports', …)`** – Declares `valid: []` (deliberately empty) and one `invalid` case:
    - Code: `import { userRepository } from '@modules/users';`
    - Expects exactly one error with `messageId: 'binding'`.

## Relationships

- **`scripts/eslint/no-persistence-imports.ts`** – The rule under test; imported as `noPersistenceImports` and passed to `RuleTester`.
- **`eslint` (package)** – Provides the `RuleTester` API used to drive the test.
- **`comment-links.test.ts`** (sibling test, referenced only in a comment) – Establishes the convention of carrying exactly one known-bad input per rule when the rule "still fires," rather than a full case table.

## Notes

- The empty `valid` array is **intentional**, not an omission. The header comment explains this mirrors the pattern in `comment-links.test.ts`: the rule is known to fire, so the test only asserts the _which-error-path_ (binding vs. path) rather than exhaustive pass/fail coverage.
- The `as never` cast on the rule export works around a TypeScript typing mismatch between the rule's inferred return type and what `RuleTester` expects.
- The single test case is designed so that only the **binding name** (`userRepository`) can trigger the violation—the specifier `@modules/users` is neutral—making it a pure binding-path assertion.
