---
source: tests/unit/scripts/eslint/controller-chain-must-catch.test.ts
sha256: 3ad91c75ead5c55dff753d4f5c905c83d0b94782113d81bb9ebf577466b298bb
generated_at: 2026-11-08T10:36:40.681656+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/scripts/eslint/controller-chain-must-catch.test.ts

## Purpose

Unit test for the `controller-chain-must-catch` ESLint rule. It verifies that the rule still fires on its primary bug pattern (a promise chain using `.then` without a `.catch` in a controller handler). It deliberately contains a single invalid case and no case table, per the convention documented in `comment-links.test.ts`.

## Key elements

- **`tester`** — An ESLint `RuleTester` instance configured with `ecmaVersion: 'latest'` and `sourceType: 'module'`.
- **`tester.run('controller-chain-must-catch', …)`** — Executes the rule against the test set: `valid` is empty; `invalid` holds one snippet (an exported async handler calling `service.list().then(…)` with no `.catch`) that must produce error `messageId: 'missing'`.

## Relationships

- **`scripts/eslint/controller-chain-must-catch.ts`** — The rule under test. The test imports `controllerChainMustCatch` from that module and passes it to `RuleTester`.

## Notes

- The `as never` cast on the rule import works around a TypeScript type mismatch between the rule's declared shape and what `RuleTester` expects; this is a known workaround, not a bug.
- The file intentionally avoids a multi-row case table. The header comment points to `comment-links.test.ts` for the rationale (one known-bad input per rule test to keep the suite minimal).
- `valid` is an empty array: the rule is only exercised in its firing path here.
