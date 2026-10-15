---
source: src/modules/products/tests/unit/tax.test.ts
sha256: c42109de0385aae28993b8c953a434f936cd2dd6ee50f98db33ded18fb14bc62
generated_at: 2026-10-15T11:50:44.873530+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/tests/unit/tax.test.ts

## Purpose

Unit tests for `resolveTaxRate`, the single decision point that maps a product's (possibly absent) tax class to a concrete VAT rate. The suite guards the invariant that every product resolves to a real number and never to `undefined`.

## Key elements

- **`describe('resolveTaxRate')`** — single test block with four cases:
  - *absent tax class → shop default* (`NODE_VAT_RATE_DEFAULT`)
  - *"reduced" → reduced rate* (`NODE_VAT_RATE_REDUCED`), verifying it does **not** fall through to default
  - *"zero" → 0* regardless of configured rates
  - *type guard* — loops over `undefined | 'reduced' | 'zero'` and asserts `typeof` is always `"number"`
- **`setEnvironment({...})`** — called at the top of each case to pin the two `NODE_VAT_RATE_*` env vars for that specific scenario.

## Relationships

- **`src/modules/products/tax.ts`** — the system under test; `resolveTaxRate` is imported directly from this module.
- **`tests/support/environment.ts`** — provides `setEnvironment` (imported as `@tests/environment`) to isolate per-case env-var state so the suite-wide fallback cannot leak between cases.

## Notes

- The module doc-comment references `tests/support/setup-environment.ts` as the source of the suite-wide fallback that these tests must not depend on; that file is **not** a direct import here, but its effect is what `setEnvironment` overwrites per case.
- Env vars are set as **strings** (`'0.22'`, `'0.1'`) and the function is expected to parse them into numbers.
- The "never returns undefined" test is a redundant-type safety net: it checks `typeof` rather than a specific value, making it the last line of defense if a future tax-class string is added without a corresponding `it` block.
