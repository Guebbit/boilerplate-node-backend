---
source: src/modules/orders/tests/unit/snapshot.test.ts
sha256: 0d852d11862e18a125158e26a47c0e9454b4ca63125ab484640b20c86216d236
generated_at: 2026-09-23T19:15:27.672133+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/unit/snapshot.test.ts

## Purpose

Unit tests for the buyer-language snapshot freezing logic (`resolveSnapshotProducts` and `freezeOrderLines`). A fake `TranslationPort` replaces the real `@modules/locales` dependency so the tests verify the fallback-chain wiring, explicit-locale binding, `_id` preservation, VAT-rate resolution, and weight handling without a database.

## Key elements

- **`fakePort(overrides?)`** — factory returning a `TranslationPort` whose six methods (`resolve`, `removeAll`, `search`, `plan`, `write`, `readAll`) are `jest.fn()` stubs; individual tests spread overrides to replace one method.
- **`afterEach(() => registerTranslationPort(undefined))`** — global cleanup that unregisters the port between tests.
- **`describe('resolveSnapshotProducts')`** — five tests covering: overlay of resolved fields keyed by product id, the full fallback chain (`exact → base → deployment`), pass-through when no translation row exists, binding to the _explicit_ locale argument (not ambient), and preservation of the original `Types.ObjectId`.
- **`describe('freezeOrderLines — the VAT rate')`** — five tests covering: absent `taxClass` → default rate, `'reduced'` → reduced rate, weight copied onto the frozen line, weight left `undefined` when absent, and the runtime guarantee that `taxClass` never appears on the frozen product.

## Relationships

- **`src/modules/orders/services/snapshot.ts`** — the SUT; this file imports `freezeOrderLines` and `resolveSnapshotProducts` and asserts their output contracts.
- **`src/kernel/translation.ts`** — provides `registerTranslationPort` (used to install/tear-down the fake) and the `TranslationPort` type that `fakePort` must satisfy.
- **`@infrastructure/i18n`** (dynamic `import` in the locale-binding test) — supplies `runWithLocale` to set an ambient locale and prove the explicit argument wins.

## Notes

- VAT tests mutate `process.env.NODE_VAT_RATE_DEFAULT` / `NODE_VAT_RATE_REDUCED` and restore the originals in a local `afterEach`; forgetting to run that block would leak env state into subsequent suites.
- The file header states an input contract: products arrive as plain objects (no Mongoose hydration), so there is intentionally no test for a hydrated document.
- The one dynamic `import('@infrastructure/i18n')` is the only top-level import not listed in the static import block; static-analysis tools that ignore dynamic imports will miss this dependency.
