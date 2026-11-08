---
source: src/modules/cart/tests/unit/merge-rule.test.ts
sha256: bca9021d666f11a97102a854148eeca07712357319eb339b5f4e0155415cfc2b
generated_at: 2026-11-08T05:24:53.099265+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/tests/unit/merge-rule.test.ts

## Purpose

Unit tests for the `planMergeLine` domain rule that decides how many units of a requested product line to add to an existing cart holding, and why (or why not). The suite asserts invariants over a combinatorial grid of inputs rather than isolated examples, so boundary and precedence behavior is guaranteed, not merely spot-checked.

## Key elements

- **`LINE_MAX`** (999) – the cart's per-line ceiling, hardcoded to match the domain model's declaration.
- **`plan(facts)`** – thin wrapper that fills in defaults (`listed: true`, `lineMax: LINE_MAX`) and delegates to `planMergeLine`, letting each test case specify only the fields under test.
- **Named case tests** – individual `it` blocks pinning the exact `{ add, reason? }` output for: clean add, summed, capped (partial), capped (zero), over-ceiling single line, exact-ceiling hit, and unlisted product.
- **Reason-precedence block** – confirms the ordering *removed > capped > summed* when multiple conditions are true simultaneously.
- **Grid invariant block** (`it.each(grid)`) – iterates over a 5 × 5 × 2 cartesian product (quantities × holdings × visibility) and asserts three universal invariants: `add ≥ 0`, resulting total ≤ ceiling, `add ≤ requested`; plus that unlisted products always yield `add: 0`. A second `it.each` asserts a reason is present *exactly* when the line did not land as requested.

## Relationships

- **`src/modules/cart/domain/index.ts`** – the test's sole import (`../../domain`); re-exports `planMergeLine` and the `MergeLineFacts` type.
- **`src/modules/cart/domain/merge.ts`** – the implementation file that `index.ts` re-exports; this test exercises its public contract without mocking it.

No other listed neighbor is imported or referenced directly in this file.

## Notes

- Stock is deliberately **not** an input. The test models only the merge rule's arithmetic; stock feasibility is a separate `fitsStock` check applied downstream (e.g. by `POST /cart`).
- The "reason" field is `undefined` (not `null`/empty string) when the line lands exactly as requested. Tests rely on `reason === undefined` for that case.
- The ceiling value (999) is duplicated between the test and the domain model. If the domain changes its max, this constant and the grid boundaries (`998`, `999`, `1000`) must be updated in lockstep.
