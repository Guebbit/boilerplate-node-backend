---
source: src/modules/cart/tests/unit/merge-rule.test.ts
sha256: dba1de48a48399da9a54f4f0ff5562ec2d00edc619eb3e3f67df929c5c358f23
generated_at: 2026-11-14T19:36:45.361491+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/tests/unit/merge-rule.test.ts

## Purpose

Unit tests for `planMergeLine`, the cart domain's merge rule that decides how many units a new `POST /cart` request adds to an existing line and which user-facing reason explains the outcome. The suite asserts invariants over a full input grid (quantities × holdings × visibility) plus named boundary cases that pin the reason-priority order, without mocks or database access.

## Key elements

- **`plan` (local helper)** — Fills in fixed ceilings (`LINE_MAX = 999`, `MAX_LINES = 100`) and default `listed: true, lines: 0`, then delegates to `planMergeLine`. Each test case supplies only the fields relevant to the scenario under test.
- **Named single-reason cases** — One `it` block per outcome: clean add (no reason), `summed`, `capped` (partial, zero, single-line overflow), `removed`, `cart_full`, and "lands exactly on the ceiling with no reason."
- **Priority sub-describe** — Verifies the fixed precedence `removed > cart_full > capped > summed` when multiple conditions are simultaneously true.
- **Grid invariant tests (`it.each`)** — Two parameterised blocks over a 5×5×2 grid (quantities × holdings × visibility):
  1. *Cart honesty*: `add ≥ 0`, `held + add ≤ LINE_MAX`, `add ≤ requested`, and unlisted products always get `add = 0`.
  2. *Reason presence*: `reason` is `undefined` if and only if the line landed exactly as asked (listed, `add === requested`, `held === 0`).

## Relationships

- **`src/modules/cart/domain/merge.ts`** — Implementation of `planMergeLine` and the `MergeLineFacts` type under test.
- **`src/modules/cart/domain/index.ts`** — Barrel module this file imports from (`import { planMergeLine, type MergeLineFacts } from '../../domain'`).
- **`scenarios/products.ts`** / **`src/modules/locales/services/translations.ts`** — Graph-level neighbors (shared product fixtures and translation lookups consumed elsewhere in the cart/locale feature); this test file does not import them directly.

## Notes

- **Stock is deliberately absent.** The rule computes what `POST /cart` *would* add; a separate `fitsStock` check (outside this module) flags the result against actual inventory. Do not add stock parameters to `MergeLineFacts` based on these tests.
- **Reason strings are opaque here.** `'summed'`, `'capped'`, `'removed'`, `'cart_full'` are matched as raw strings; their display form is resolved downstream by the translations service. Changing a reason key requires updating both the domain constant and the locale entries.
- **`LINE_MAX` and `MAX_LINES` are test-local constants (999 / 100).** They mirror the model's declared ceilings but are not imported from the domain. If the production ceilings change, these tests will still pass—update them in lockstep with the model.
