---
source: src/modules/products/tests/unit/config.test.ts
sha256: 93a0ce0efb31a11d00e9732407ddbd88b6c1a9c49b04c3c4ac94dc2bcd90109a
generated_at: 2026-09-23T19:30:27.384288+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/tests/unit/config.test.ts

## Purpose

Unit tests for the products module's VAT-rate boot gate. Verifies that `assertRequiredConfig` rejects missing or malformed `NODE_VAT_RATE_DEFAULT` / `NODE_VAT_RATE_REDUCED` values, accepts valid ones, and that the public readers (`vatRateDefault`, `vatRateReduced`) resolve per-call with correct fallbacks.

## Key elements

- **`TOUCHED`** — const tuple listing every env var the suite mutates (`NODE_ENV`, `NODE_URL`, `NODE_VAT_RATE_DEFAULT`, `NODE_VAT_RATE_REDUCED`); passed to `withoutEnvironmentInThisFile` for automatic cleanup.
- **`configure()`** — helper that sets a fully valid baseline env (development mode, URL, both VAT rates) so each case can break exactly one thing.
- **`describe('the VAT rate boot gate')`** — drives `assertRequiredConfig([productsModule])` to exercise the manifest's `customCheck`: missing-both-rates, a table of invalid strings (`abc`, `1`, `1.5`, `-0.1`, `.5`, `1e-1`, whitespace), and the valid edge case of `0`.
- **`describe('reading the rates')`** — calls `vatRateDefault()` / `vatRateReduced()` directly to confirm per-call resolution and the 0.22 / 0.1 fallbacks when the env vars are absent.

## Relationships

- **`src/kernel/required-config.ts`** — source of `assertRequiredConfig`, the function under test. The suite passes the module manifest through it to exercise the `customCheck` wiring.
- **`src/modules/products/config.ts`** — source of `vatRateDefault` and `vatRateReduced`, the reader functions tested in the second `describe` block.
- **`src/modules/products/module.ts`** — default export (`productsModule`); its manifest is the array element passed to `assertRequiredConfig`, making the test dependent on the manifest actually declaring the `customCheck`.
- **`tests/support/environment.ts`** — provides `withoutEnvironmentInThisFile`, which snapshots and restores the vars in `TOUCHED` around the file's execution.

## Notes

- The gate **short-circuits when `NODE_ENV === 'test'`**, so `configure()` always sets it to `'development'`. A suite that forgets this step would silently pass without asserting anything.
- Tests deliberately go through `assertRequiredConfig` rather than calling `invalidVatRateConfig` directly: the manifest wiring (registration of `customCheck`) is part of what is under test.
- The `.5` / `1e-1` cases target a real parse-grammar divergence: a bare `Number()` coerces both to in-range floats, but `parseEnvironmentDecimal` rejects them, so the gate must reject them to avoid silently charging the fallback rate.
- `withoutEnvironmentInThisFile` handles both per-test isolation and file-end restoration; individual tests should not also `delete` env vars in `afterEach`.
