---
source: tests/unit/scripts/eslint/controller-chain-must-catch.test.ts
sha256: 3ad91c75ead5c55dff753d4f5c905c83d0b94782113d81bb9ebf577466b298bb
generated_at: 2026-09-23T20:30:29.113405+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/scripts/eslint/controller-chain-must-catch.test.ts

## Purpose

Minimal regression test for the `controller-chain-must-catch` ESLint rule. It verifies that the rule still fires on its canonical bad pattern (a `.then` without a `.catch` in an exported handler). The comment at the top notes this is one of four rule tests that deliberately carry a single known-bad input instead of a full case table, for the reasons documented in `comment-links.test.ts`.

## Key elements

- **`tester`** – An ESLint `RuleTester` instance configured with `ecmaVersion: 'latest'` and `sourceType: 'module'`.
- **`tester.run('controller-chain-must-catch', …)`** – Registers one test suite:
  - `valid: []` – no passing cases.
  - `invalid[0]` – an `export const` handler that calls `service.list().then(…)` with no `.catch`; expects a single error with `messageId: 'missing'`.

## Relationships

- **`scripts/eslint/controller-chain-must-catch.ts`** (graph neighbor) – the rule under test. This file imports its `controllerChainMustCatch` export and passes it to `RuleTester.run`, asserting the rule reports the expected `missing` diagnostic.

## Notes

- The cast `controllerChainMustCatch as never` silences a type mismatch between the project's rule type and `RuleTester`'s expected signature; it is a workaround, not a semantic assertion.
- Intentionally minimal: no `valid` cases and no multi-error scenarios. Do not add cases without first reading the comment linking to `comment-links.test.ts`, which explains the constraint.
