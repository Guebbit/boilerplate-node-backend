---
source: tests/unit/scripts/eslint/comment-links.test.ts
sha256: 04ca49da3191516222f0bb20541c0a839b44149cb07e53442c40361c63fbcb72
generated_at: 2026-11-08T10:36:35.011083+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/scripts/eslint/comment-links.test.ts

## Purpose

A liveness (smoke) test for the `comment-links` ESLint rule. It verifies that the rule still *matches* at least one known-bad input, so a silently-broken rule is distinguishable from a genuinely clean lint run. Exhaustive case coverage was intentionally removed: the repo lints its own ~1,000 files on every `npm run lint`, which surfaces false positives immediately.

## Key elements

- **`tester`** — `eslint.RuleTester` configured with `ecmaVersion: 'latest'` and `sourceType: 'module'`.
- **`valid: []`** — Intentionally empty. No "should-not-fire" cases are asserted here.
- **`invalid` (1 entry)** — A single snippet (`// Built by src/infrastructure/adapters/no-such-file.ts.`) that references a non-existent path, expecting the rule to report one error with `messageId: 'stale'`.
- **`as never` cast** — Applied to `commentLinks` when passed to `tester.run` to satisfy `RuleTester`'s type signature.

## Relationships

- **`scripts/eslint/comment-links.ts`** — The rule under test. This file imports its `commentLinks` export and feeds it one invalid fixture through `RuleTester`.

## Notes

- The file's header comment documents the design decision: exhaustive tests were deleted *on purpose* because self-linting covers the false-positive direction; this file only guards the false-negative (rule went silent) direction.
- Only the `stale` messageId is exercised. If the rule adds new message IDs, this test will not catch their absence.
