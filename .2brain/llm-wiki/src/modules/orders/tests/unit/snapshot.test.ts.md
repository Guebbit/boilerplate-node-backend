---
source: src/modules/orders/tests/unit/snapshot.test.ts
source_sha256: 71b63d7ce443cf80f5f66b558f2d899d5bc35c779ebc1140a073d8a69522db1d
context_sha256: 9e44ec8925786dc59d13d67f9d7a2c131afaeed66f6999727321bdd3f3b8b584
generated_at: 2026-11-22T06:38:23.925739+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/orders/tests/unit/snapshot.test.ts

## Purpose
Unit tests for the order-line snapshot logic in `src/modules/orders/services/snapshot.ts`: `resolveSnapshotProducts` (buyer-language resolution of product fields) and `freezeOrderLines` (freezing product data, including the VAT rate, onto order lines). A fake `TranslationPort` replaces `@modules/locales`, so no database is needed.

## Key elements
- `fakePort(overrides)` — builds a `TranslationPort` double with jest-mocked methods (`resolve`, `removeAll`, `search`, `plan`, `write`, `readAll`, `readServed`, `canPreviewDrafts`). Individual methods can be overridden per test.
- `afterEach(() => registerTranslationPort(undefined))` — unregisters the port after every test. The `freezeOrderLines` block repeats this in its own `afterEach`.
- `describe('resolveSnapshotProducts')` verifies:
  - Resolved fields are overlaid onto the product, keyed by its own id; other fields are untouched.
  - The port is asked for the full fallback chain, e.g. `['it-CH', 'it', 'en']`.
  - A product with no translation row is returned unchanged.
  - The explicit locale argument is used instead of the ambient one set with `runWithLocale` from `@infrastructure/i18n`.
  - The product's original `ObjectId` `_id` is preserved.
- `describe('freezeOrderLines — the VAT rate')` verifies:
  - An absent `taxClass` resolves to `NODE_VAT_RATE_DEFAULT`, and `'reduced'` resolves to `NODE_VAT_RATE_REDUCED`. Both are set through `setEnvironment`.
  - `weight`, `sku`, and `rateType` are frozen onto the line when present, and stay `undefined` when absent.
  - `taxClass` is never present on the frozen product; only the resolved `taxRate` is.
  - A nested `a preorder line` block checks that a future `releaseDate` freezes `preorder: true` plus the date. A past date, or no date, leaves `preorder` undefined.

## Relationships
- `src/modules/orders/services/snapshot.ts` — the code under test (`resolveSnapshotProducts`, `freezeOrderLines`).
- `src/kernel/translation.ts` — supplies `registerTranslationPort` and the `TranslationPort` type used to inject the fake port.
- `tests/support/environment.ts` — supplies `setEnvironment`, used to set the VAT rate environment variables.

## Notes
- Products passed to `resolveSnapshotProducts` are assumed to be plain objects already. The tests do not cover hydrated Mongoose documents.
- `rateType` is frozen as-is, unlike `taxClass`, which is resolved into `taxRate` and then dropped. The test comment says an invoice needs the actual reason code rather than a decimal.
- The tests assert the exact `resolve` call: `('product', [id], candidates, undefined)`.
