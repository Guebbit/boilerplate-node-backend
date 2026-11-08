---
source: src/modules/orders/tests/unit/snapshot.test.ts
sha256: 8df49a8cbf0c88b39f11ff095aed1c6b10ee358d84272ae720f00e84a667e444
generated_at: 2026-11-08T07:14:27.195700+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/unit/snapshot.test.ts

## Purpose

Unit tests for `resolveSnapshotProducts` and `freezeOrderLines` (the buyer-language resolution and field-freezing logic that runs before an order line is embedded in an order document). A fake `TranslationPort` replaces the real `@modules/locales` implementation so the tests verify fallback-chain wiring, explicit-locale binding, VAT-rate resolution, and field-preservation contracts without a database.

## Key elements

- **`fakePort(overrides?)`** — Factory returning a `TranslationPort` whose every method is a `jest.fn()` stubbed to a no-op/empty default. Individual tests override specific methods to assert call arguments or return values.
- **`describe('resolveSnapshotProducts')`** — Five tests covering: translation overlay keyed by product `_id`; the full fallback chain passed to `port.resolve` (exact tag → base language → deployment fallback); unchanged product when no translation row exists; explicit-locale binding (ambient `runWithLocale('en')` must not leak into candidates built from the `'it'` argument); and preservation of the original `Types.ObjectId` `_id`.
- **`describe('freezeOrderLines — the VAT rate')`** — Tests for: default `taxRate` when `taxClass` is absent; reduced rate when `taxClass === 'reduced'`; passthrough of `weight`, `sku`, and `rateType` (including their absent cases); stripping of `taxClass` from the frozen line; and preorder flag logic (date in the future → `preorder: true`; past or missing date → no flag).

## Relationships

- **`src/modules/orders/services/snapshot.ts`** — The module under test. Imports `resolveSnapshotProducts` and `freezeOrderLines`; all assertions target their return shapes.
- **`src/kernel/translation.ts`** — Provides `registerTranslationPort` (global singleton injection) and the `TranslationPort` type. Tests call `registerTranslationPort(fakePort(...))` before each scenario and `registerTranslationPort(undefined)` in `afterEach` to prevent cross-test leakage.
- **`tests/support/environment.ts`** — Provides `setEnvironment` to set process-level env vars (`NODE_VAT_RATE_DEFAULT`, `NODE_VAT_RATE_REDUCED`) that `freezeOrderLines` reads at runtime.

## Notes

- The translation port is injected via a **global mutable singleton** (`registerTranslationPort`), not constructor DI. Forgetting the `afterEach` cleanup would let a fake port leak into unrelated test files running in the same worker.
- One test dynamically imports `@infrastructure/i18n` (`await import`) specifically to call `runWithLocale('en')` and prove the explicit locale argument wins over the ambient one—avoiding the need to restructure the module.
- `taxClass` is **resolved** into a numeric `taxRate` and then **dropped** from the frozen product; `rateType`, by contrast, has no resolved form and passes through as-is. This asymmetry is intentional (invoices need the reason code) and is asserted explicitly.
- Products arriving at these functions are already plain objects per the service contract; the tests do not cover the hydrated-Mongoose-document → plain-object conversion.
