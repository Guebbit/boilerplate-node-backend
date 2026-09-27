---
source: src/modules/orders/tests/unit/snapshot.test.ts
sha256: 40634916a1dc4d4486142e0d4ac0daeb632d5b94232370559f01413be5d731c6
generated_at: 2026-09-27T15:22:33.370274+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/unit/snapshot.test.ts

## Purpose

Unit tests for the order-line snapshot service. It verifies two contracts without a database: (1) `resolveSnapshotProducts` correctly overlays buyer-language translations onto plain product objects using the fallback-chain, and (2) `freezeOrderLines` resolves `taxClass` to a numeric VAT rate and copies scalar fields (weight, sku) onto the frozen line while stripping the class itself.

## Key elements

- **`fakePort(overrides?)`** — factory that returns a `TranslationPort` double whose methods are `jest.fn()` mocks; tests override individual methods (usually `resolve`) per case.
- **`resolveSnapshotProducts` describe block** — five tests covering: field overlay keyed by product `_id`; the exact fallback-chain order (`it-CH → it → en`) passed to `resolve`; passthrough when no translation row exists; binding to the *explicit* locale argument (not the ambient `runWithLocale` value); and preservation of the original `ObjectId` instance.
- **`freezeOrderLines — the VAT rate` describe block** — seven tests covering: absent `taxClass` → `NODE_VAT_RATE_DEFAULT`; `taxClass: 'reduced'` → `NODE_VAT_RATE_REDUCED`; weight and sku copied verbatim when present, left `undefined` when absent (no silent defaults); and `taxClass` itself absent from the frozen product (restating the type-level omission at runtime).
- **`afterEach` hooks** — reset the registered `TranslationPort` to `undefined` and restore `NODE_VAT_RATE_*` env vars.

## Relationships

- **`src/modules/orders/services/snapshot.ts`** — the system under test; imports `freezeOrderLines` and `resolveSnapshotProducts` and exercises their public behavior.
- **`src/kernel/translation.ts`** — provides `registerTranslationPort` (used in setup/teardown) and the `TranslationPort` type (consumed by the `fakePort` factory).

## Notes

- All products handed to the tested functions are **plain objects** by contract; the tests never pass hydrated Mongoose documents, so there is no need to test that path.
- The locale-binding test dynamically imports `@infrastructure/i18n` (`runWithLocale`) to create an ambient locale that *differs* from the explicit argument, proving the function ignores the ambient value.
- VAT-rate tests mutate `process.env` and restore it in `afterEach`; run order matters if the env vars are set by other suites.
- The `taxClass`-exclusion test is explicitly a **runtime restatement** of a type-level guarantee (`FrozenOrderLineProduct` omits the field); both layers are intentional.
