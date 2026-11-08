---
source: src/modules/products/tests/unit/tax.test.ts
sha256: c42109de0385aae28993b8c953a434f936cd2dd6ee50f98db33ded18fb14bc62
generated_at: 2026-11-08T07:55:02.073405+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/tests/unit/tax.test.ts

## Purpose

Unit tests for `resolveTaxRate`, the single decision point that maps a product's tax class (or the absence of one) to a concrete numeric VAT rate. The suite guarantees that every product resolves to *some* rate and isolates the two relevant environment variables per case so the suite-wide fallback from `tests/support/setup-environment.ts` cannot leak between cases.

## Key elements

- **`describe('resolveTaxRate')`** – top-level suite; four cases:
  - *absent tax class → shop default*: sets only `NODE_VAT_RATE_DEFAULT`, asserts `resolveTaxRate(undefined) === 0.22`.
  - *`"reduced"` → reduced rate*: sets both `NODE_VAT_RATE_DEFAULT` and `NODE_VAT_RATE_REDUCED`, asserts the reduced value is returned, not the default.
  - *`"zero"` → `0`*: asserts a hard-coded zero regardless of env configuration.
  - *never returns `undefined`*: iterates all three tax-class inputs and asserts the result is always of type `number`.
- **`setEnvironment`** (imported from `@tests/environment`) – per-test helper that sets process-level env vars for the duration of a case.

## Relationships

- **`src/modules/products/tax.ts`** — the module under test; provides the `resolveTaxRate` function whose behavior these cases pin down.
- **`tests/support/environment.ts`** — supplies the `setEnvironment` helper used to scope `NODE_VAT_RATE_DEFAULT` / `NODE_VAT_RATE_REDUCED` to individual test cases, preventing cross-case contamination from the global setup.

## Notes

- The module docblock positions `resolveTaxRate` as *the* single place where a product's rate is decided; any new tax-class handling should go there, and these tests act as the contract.
- Env vars are set **inside each test** (not in `beforeEach`) so that cases that only care about one rate don't accidentally inherit the other from a shared hook.
- The `"zero"` case is deliberately config-independent — the rate must be `0` no matter what the environment holds.
