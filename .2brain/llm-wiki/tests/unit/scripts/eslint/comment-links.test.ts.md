---
source: tests/unit/scripts/eslint/comment-links.test.ts
sha256: 04ca49da3191516222f0bb20541c0a839b44149cb07e53442c40361c63fbcb72
generated_at: 2026-09-23T20:30:23.409617+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/scripts/eslint/comment-links.test.ts

## Purpose

A liveness check for the `comment-links` ESLint rule. Rather than an exhaustive case table, it supplies a single known-bad input to prove the rule still fires. The rationale: the rule runs against ~1,000 repo files on every `npm run lint`, so false positives surface naturally; this test guards the opposite failure mode — a rule that has silently stopped matching anything, which would look identical to a clean run.

## Key elements

- **`tester`** — `RuleTester` instance configured with `ecmaVersion: 'latest'` and `sourceType: 'module'`.
- **`tester.run('comment-links', commentLinks, …)`** — Executes the rule with `valid: []` (intentionally empty) and one `invalid` entry: a `// Built by src/infrastructure/adapters/no-such-file.ts.` comment followed by code, asserting error `messageId: 'stale'`.
- **`commentLinks` import** — The rule under test, cast with `as never` to satisfy `RuleTester`'s type signature.

## Relationships

- **`scripts/eslint/comment-links.ts`** — The rule being tested. This file imports its exported `commentLinks` function and passes it to ESLint's `RuleTester`. It is the sole production dependency of this test.

## Notes

- The `valid` array is deliberately empty. This is not a regression suite; it is a smoke test confirming the rule is still wired up and matching.
- Exhaustive case coverage was intentionally removed. The design assumption is that the repo's own lint pass acts as the "valid/invalid" oracle, making a large case table redundant.
- Only **one** invalid fixture is maintained per rule. Adding more is not the convention here — the goal is minimal liveness signal, not behavioral specification.
- The `as never` cast is a TypeScript workaround for `RuleTester`'s strict generic typing on custom (non-`Rule.RuleModule`) rule objects; it does not alter runtime behavior.
