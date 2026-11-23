---
source: src/modules/products/tests/unit/config.test.ts
source_sha256: 8a90092d737482f6a417709c38ea5fe849b7ae8c11af8c6138b8dbb73d8f13da
context_sha256: 99ca2b3a34cd31c423853df1ca9781e2607782ddc4d8451bd5765404705964c4
generated_at: 2026-11-22T07:19:08.729973+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/products/tests/unit/config.test.ts

## Purpose
Unit tests for the products module's VAT-rate boot gate: the two rates (default and reduced) declared on the module manifest and range-checked by its slice check. It also covers how the rates are read at runtime.

## Key elements
- `TOUCHED`: the env vars the suite controls (`NODE_ENV`, `NODE_URL`, `NODE_VAT_RATE_DEFAULT`, `NODE_VAT_RATE_REDUCED`). They are passed to `withoutEnvironmentInThisFile`, so they are cleared before each case and restored after the file.
- `configure()`: sets a fully valid deployment (`NODE_ENV=development`, a URL, rates `0.22` and `0.1`). Each case then breaks one thing.
- `describe('the VAT rate boot gate')`: calls `assertModuleConfig([productsModule], [])` and checks that:
  - It throws naming both variables when neither rate is set.
  - It throws naming `NODE_VAT_RATE_DEFAULT` for `abc`, `1`, `1.5`, `-0.1`, `.5`, `1e-1` and `' '`. These are checked with `it.each`.
  - It accepts a rate of exactly `0`.
  - It accepts a fully configured catalogue.
- `describe('reading the rates')`:
  - `vatRateDefault()` reads the environment on each call, so an override applies to the next read (`0.05`).
  - With the rates unset, `vatRateDefault()` returns `0.22` and `vatRateReduced()` returns `0.1`.

## Relationships
- `@kernel/module-config` (`src/kernel/module-config.ts`): provides `assertModuleConfig`, the entry point under test.
- `src/modules/products/config.ts`: provides `vatRateDefault` and `vatRateReduced`, which are exercised directly in the "reading the rates" block.
- `src/modules/products/module.ts`: the default-exported `productsModule` manifest passed to `assertModuleConfig`. Going through it also tests the manifest wiring.
- `@tests/environment` (`tests/support/environment.ts`): provides `withoutEnvironmentInThisFile` and `setEnvironment` for isolating and setting env vars.

## Notes
- Every gate case sets `NODE_ENV` to `development`, because the gate short-circuits under `NODE_ENV=test`. Leaving it alone would make the assertions vacuous.
- The gate is tested through `assertModuleConfig` rather than by calling `invalidVatRateConfig` directly. A test that skipped the manifest could still pass with the slice check unset.
- `.5` and `1e-1` are rejected on purpose. A bare `Number(raw)` would accept them as 0.5 and 0.1, but `vatRateDefault` reads through the stricter `decimal` field grammar and would silently fall back to `0.22`. The gate therefore must not accept a value that would be charged at the wrong rate.
- The fallback defaults (`0.22`, `0.1`) apply under the test environment and the demo profile, which skip the gate.
