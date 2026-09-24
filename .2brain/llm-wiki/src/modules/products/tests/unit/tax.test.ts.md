---
source: src/modules/products/tests/unit/tax.test.ts
sha256: 017603503fb538afa3feaa2dfce6b43898cb7da618262d5735300d95b466ced8
generated_at: 2026-09-23T19:31:08.612393+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/tests/unit/tax.test.ts

## Purpose

Unit tests for `resolveTaxRate`, verifying that every product tax class (`undefined`, `"reduced"`, `"zero"`) resolves to a concrete numeric rate and never yields `undefined`. Also guards against env-var state leaking between cases by restoring the two VAT rate variables after every test.

## Key elements

- **`ORIGINAL`** — captured at module load; stores the initial values of `NODE_VAT_RATE_DEFAULT` and `NODE_VAT_RATE_REDUCED` so `afterEach` can restore them.
- **`afterEach` hook** — resets both env vars to `ORIGINAL` values, preventing cross-case contamination (especially from the suite-wide fallback set in `tests/support/setup.ts`).
- **`describe('resolveTaxRate')`** — four test cases:
    - absent tax class → shop default rate
    - `"reduced"` → reduced rate (not the default)
    - `"zero"` → always `0`, independent of env config
    - exhaustive guard: for all three inputs the return type is `number` (never `undefined`)

## Relationships

- **`src/modules/products/tax.ts`** — the sole import; provides the `resolveTaxRate` function under test.
- **`tests/support/setup.ts`** (referenced in the module doc-comment) — sets a suite-wide default for the env vars; this test file explicitly counters that to isolate each case.

## Notes

- The env-var cleanup is intentional and non-obvious: without the `afterEach` restore, the suite-wide fallback from `setup.ts` could make later assertions in _other_ test files pass or fail unpredictably.
- Test inputs are typed as the literal union `[undefined, 'reduced', 'zero'] as const` in the final case, keeping the "never undefined" guard exhaustive.
- Rates are expressed as decimals (e.g. `0.22` for 22 %), matching what `resolveTaxRate` returns.
