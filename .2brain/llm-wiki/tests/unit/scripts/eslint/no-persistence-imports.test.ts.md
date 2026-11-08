---
source: tests/unit/scripts/eslint/no-persistence-imports.test.ts
sha256: 89e3384dee940d34d3487150ac8f486caa621351bb10209ea76bf19234c5fee9
generated_at: 2026-11-08T10:37:13.484878+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/scripts/eslint/no-persistence-imports.test.ts

## Purpose

Unit test for the `noPersistenceImports` ESLint rule. It verifies that the rule's **binding-name** detection fires when a persistence object (e.g. `userRepository`) is imported through a non-persistence-specific barrel specifier (`@modules/users`). A single invalid case is used instead of a full case table; the header comment points to `comment-links.test.ts` for the reason behind this minimal shape.

## Key elements

- **`STRICT`** — Options array (`[{ bindings: ['Repository', 'Model'], paths: true }]`) that enables both halves of the rule so the single bad input exercises the binding match.
- **`tester.run('no-persistence-imports', …)`** — Runs exactly one valid (empty) and one invalid test case via `eslint`'s `RuleTester`.
- **Invalid case** — Asserts that `import { userRepository } from '@modules/users'` produces one error with `messageId: 'binding'`, confirming the rule catches the violation by binding name alone, even when the specifier carries no persistence signal.

## Relationships

- **`scripts/eslint/no-persistence-imports.ts`** — The module under test. The file imports its exported `noPersistenceImports` rule object and passes it to `RuleTester.run`.

## Notes

- The rule is cast `as never` when handed to `RuleTester.run`; this is a workaround for type-mismatch between the rule's actual signature and `RuleTester`'s expected parameter type.
- `valid` is intentionally empty — no pass-case is asserted here.
- The header comment (`still fires`) and the cross-reference to `comment-links.test.ts` explain why the suite is a single bad input rather than a parameterized table; treat this as a deliberate, documented choice rather than an incomplete test.
