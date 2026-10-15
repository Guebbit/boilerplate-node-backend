---
source: src/modules/products/tests/unit/config.test.ts
sha256: 7e2504eab5f3b700db2f46678e826d8eb751ac748c0ef848417eefdb9ff748cb
generated_at: 2026-10-15T11:49:46.289465+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/tests/unit/config.test.ts

## Purpose

Unit tests for the products module's VAT-rate boot gate. Validates that `assertModuleConfig` correctly rejects invalid or missing `NODE_VAT_RATE_*` values through the module manifest wiring, and that the `vatRateDefault`/`vatRateReduced` readers return the expected numbers. Driven through the public manifest entry point (not the internal check directly) so the slice-check wiring is exercised.

## Key elements

- **`TOUCHED`** – Frozen tuple of every env var this file reads or writes; passed to `withoutEnvironmentInThisFile` for per-file cleanup.
- **`configure()`** – Helper that sets a fully valid baseline (`NODE_ENV=development`, `NODE_URL`, both VAT rates) so each case can mutate exactly one variable.
- **`describe('the VAT rate boot gate')`** – Calls `assertModuleConfig([productsModule], [])` and asserts throw/accept:
  - Neither rate set → throws naming both vars.
  - `it.each` over `['abc','1','1.5','-0.1','.5','1e-1',' ']` → each rejected for `NODE_VAT_RATE_DEFAULT`.
  - Rate `'0'` → accepted (zero-VAT shop).
  - Fully configured baseline → accepted.
- **`describe('reading the rates')`** – Calls `vatRateDefault()` / `vatRateReduced()` directly:
  - Override to `'0.05'` → returns `0.05` (read per call, not cached).
  - Both vars undefined → falls back to `0.22` / `0.1`.

## Relationships

- **`@kernel/module-config`** – Provides `assertModuleConfig`, the function under test; this file is its primary consumer in the test suite.
- **`../../config`** – Exports `vatRateDefault` and `vatRateReduced`, the readers whose values and fallbacks are asserted here.
- **`../../module`** – Exports `productsModule`, the manifest object passed into `assertModuleConfig`; its slice-check definition is what triggers the VAT-rate validation.
- **`@tests/environment`** – Provides `setEnvironment` (per-case mutation) and `withoutEnvironmentInThisFile` (file-scoped teardown) for hermetic env handling.

## Notes

- **`NODE_ENV` must not be `'test'`** inside a case. The gate short-circuits under the test environment, so a suite that forgets to override it will pass without asserting anything. `configure()` always sets it to `'development'`.
- **`.5` and `1e-1` are deliberately included** in the invalid-rate list: a bare `Number()` call would coerce them into in-range values (0.5, 0.1), but the `decimal` field's stricter grammar in `config.ts` would silently fall back to the default — so the gate must reject them to avoid accepting a value that the reader would then discard.
- **Manifest wiring is intentional.** Testing `assertModuleConfig([productsModule], [])` rather than the internal validator ensures the slice-check is actually registered on the manifest; a test that called the validator directly would still pass if the check were never wired up.
