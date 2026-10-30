---
source: src/modules/orders/tests/unit/snapshot.test.ts
sha256: eb5c24fb96e032373e411d98ca2723b4b10aa64ed1a6b11e0919f634f0124aed
generated_at: 2026-10-29T05:00:55.154492+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/unit/snapshot.test.ts

## Purpose

Unit tests for `resolveSnapshotProducts` and `freezeOrderLines` (the buyer-language resolution and VAT/field-freezing logic in `snapshot.ts`). A fake `TranslationPort` replaces the real locale service so the tests verify fallback-chain wiring, explicit-locale binding, `_id` preservation, and the frozen-line field contract without a database.

## Key elements

- **`fakePort(overrides?)`** — returns a `TranslationPort` whose methods are `jest.fn()` stubs (resolving empty Maps/arrays); callers spread per-test overrides on top.
- **`describe('resolveSnapshotProducts')`** — five tests covering: overlaying resolved fields by product id, the full fallback-candidate array (`it-CH → it → en`), pass-through when no translation exists, binding the *explicit* locale argument (not the ambient `runWithLocale` value), and preserving the original `ObjectId` `_id`.
- **`describe('freezeOrderLines — the VAT rate')`** — tests that an absent `taxClass` resolves to `NODE_VAT_RATE_DEFAULT`, `"reduced"` resolves to `NODE_VAT_RATE_REDUCED`, optional fields (`weight`, `sku`, `rateType`) are frozen when present and left `undefined` when absent, `taxClass` itself is never carried on the frozen line, and the `preorder` flag is set only when `releaseDate` is in the future.

## Relationships

- **`src/kernel/translation.ts`** — imports `registerTranslationPort` and the `TranslationPort` type; the test registers/unregisters the fake port via this kernel function.
- **`src/modules/orders/services/snapshot.ts`** — imports the two functions under test (`resolveSnapshotProducts`, `freezeOrderLines`).
- **`tests/support/environment.ts`** — imports `setEnvironment` to inject `NODE_VAT_RATE_*` values for the VAT-rate tests.
- **`@infrastructure/i18n`** — dynamically imported in the explicit-locale test to call `runWithLocale` and confirm the ambient locale is *not* used.

## Notes

- `afterEach` resets the registered port to `undefined` to prevent cross-test leakage; the VAT `describe` block has its own `afterEach` doing the same.
- The `taxClass` → `taxRate` resolution is a *drop* (the class string is removed from the frozen line), whereas `rateType` passes through verbatim — the tests assert both behaviors explicitly.
- Preorder flag logic is time-relative: the test computes `Date.now() ± 30 days` at runtime, so it can drift if the clock is skewed.
- The file's header comment clarifies the contract assumption: every product handed in is already a plain object (no Mongoose hydration), so no document-detection path is exercised here.
