---
source: src/modules/orders/tests/unit/snapshot.test.ts
sha256: 4965f951c141658931c56714d39b1d6c9503fb432ca9c9c1204ab5a3e070383f
generated_at: 2026-10-15T11:21:11.243372+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/unit/snapshot.test.ts

## Purpose

Unit tests for `resolveSnapshotProducts` and `freezeOrderLines` (the buyer-language snapshot-freezing logic in the orders service). A fake `TranslationPort` replaces the real `@modules/locales` adapter, so the tests verify the fallback-chain wiring, explicit-locale binding, `_id` preservation, and VAT/field-freezing contracts without a database.

## Key elements

- **`fakePort(overrides?)`** – Factory that returns a `TranslationPort` with every method stubbed as a resolved `jest.fn()`. Individual tests override specific methods (typically `resolve`).
- **`describe('resolveSnapshotProducts')`** – Five tests covering:
  - Translation overlay keyed by the product's own `_id`.
  - The full fallback chain (`it-CH → it → en`) is passed to the port.
  - Product returned unchanged when no translation row exists.
  - Explicit locale argument wins over the ambient (request) locale via `runWithLocale`.
  - The original `ObjectId` instance is preserved on the frozen product.
- **`describe('freezeOrderLines — the VAT rate')`** – Tests that `freezeOrderLines`:
  - Resolves absent `taxClass` to `NODE_VAT_RATE_DEFAULT`, `"reduced"` to `NODE_VAT_RATE_REDUCED`.
  - Freezes optional fields (`weight`, `sku`, `rateType`) only when present, leaving them `undefined` otherwise.
  - Strips `taxClass` from the frozen line (only the resolved `taxRate` survives).
  - Computes the `preorder` flag from `releaseDate` (true only when the date is still in the future).

## Relationships

- **`src/modules/orders/services/snapshot.ts`** – The system under test; provides `resolveSnapshotProducts` and `freezeOrderLines`.
- **`src/kernel/translation.ts`** – Provides `registerTranslationPort` and the `TranslationPort` type; the fake port is registered/unregistered via this module.
- **`tests/support/environment.ts`** – `setEnvironment` injects `NODE_VAT_RATE_*` values for the VAT-resolution tests.
- **`@infrastructure/i18n`** (dynamic import) – `runWithLocale` is used in one test to prove the explicit locale argument overrides the ambient request locale.

## Notes

- Every `describe` block ends with `registerTranslationPort(undefined)` in `afterEach` to avoid leaking port state across tests.
- The "explicit locale" test uses a **dynamic** `import('@infrastructure/i18n')` so the ambient locale is set *after* the fake port is registered, ensuring the assertion targets the right code path.
- `taxClass` is resolved into a numeric `taxRate` and then **dropped** from the frozen line; `rateType` is **not** resolved—it passes through as the raw reason code (e.g. `"exempt"`) because invoices need the label, not a decimal.
- The file header comment explicitly states that inputs are already plain objects; hydrated-Mongoose-document concerns are out of scope here.
