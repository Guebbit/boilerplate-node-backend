---
source: src/modules/products/tests/unit/config.test.ts
sha256: 7e2504eab5f3b700db2f46678e826d8eb751ac748c0ef848417eefdb9ff748cb
generated_at: 2026-11-08T07:53:51.751827+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/products/tests/unit/config.test.ts

## Purpose

Unit tests for the products module's VAT rate boot gate. Verifies that `assertModuleConfig` rejects missing or malformed `NODE_VAT_RATE_DEFAULT` / `NODE_VAT_RATE_REDUCED` values, accepts valid ones, and that the accessor functions (`vatRateDefault`, `vatRateReduced`) read per-call and fall back to declared defaults.

## Key elements

- **`TOUCHED`** — readonly tuple of every env var the gate reads; passed to `withoutEnvironmentInThisFile` to guarantee a clean slate per case and restore after the file.
- **`configure()`** — helper that sets a fully valid deployment baseline (`NODE_ENV=development`, a URL, both VAT rates) so individual cases can break exactly one thing.
- **`describe('the VAT rate boot gate')`** — four cases: neither rate set (error mentions both names), parametrized invalid rates (`'abc'`, `'1'`, `'1.5'`, `'-0.1'`, `'.5'`, `'1e-1'`, `' '`), rate of exactly `0` (valid), and a fully configured catalogue (valid).
- **`describe('reading the rates')`** — two cases confirming `vatRateDefault()` / `vatRateReduced()` reflect the current env on each call and return the manifest defaults (0.22 / 0.1) when the gate is skipped.

## Relationships

- **`@kernel/module-config`** — provides `assertModuleConfig`, the function under test. The test calls it with `[productsModule]` to exercise the manifest → slice-check wiring, not the validator in isolation.
- **`../../config`** — exports `vatRateDefault` and `vatRateReduced`, the accessor functions whose read-per-call and fallback behaviour are asserted in the second `describe` block.
- **`../../module`** — exports the default `productsModule` manifest that carries the VAT rate slice check; required so the boot gate actually runs.
- **`@tests/environment`** — `withoutEnvironmentInThisFile` and `setEnvironment` manage env-var lifecycle for the whole file and individual cases.

## Notes

- **`NODE_ENV` must be non-`test` in every case.** The boot gate short-circuits under the test environment; `configure()` sets it to `'development'`, but any test that omits `configure()` would silently pass without asserting anything.
- **Invalid-rate cases use a regex, not an exact string.** The "neither rate set" error can name the two variables in either order, so the assertion matches both permutations.
- **`.5` and `1e-1` are deliberately included.** A naive `Number(raw)` would accept both as in-range; the gate's stricter decimal grammar must reject them to stay consistent with what `vatRateDefault` actually parses.
- **The `configure` helper mutates real process env.** It is not sandboxed per-test beyond `withoutEnvironmentInThisFile`'s file-level guard; tests rely on calling `configure()` first rather than on Jest's automatic env isolation.
