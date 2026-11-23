---
source: src/modules/products/tests/integration/no-translation-provider.test.ts
source_sha256: a9bd1d56110910afc707dc26facee8ad394bdc0e29fd5a7ade4ee320dfd7ef29
context_sha256: 71f3cd834349b1ad84e1ce103c0e5c156ee400bf5db345632a44af0278bb34eb
generated_at: 2026-11-22T07:16:59.046273+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/products/tests/integration/no-translation-provider.test.ts

## Purpose
Integration suite for the `products` module with no translation provider installed (as when `locales` is uninstalled). It checks that the fallback language still writes and reads, and that any other language is rejected with a 422 rather than a 500 from a missing port. `src/kernel/translation.ts`'s fallback produces that answer.

## Key elements
- `setupTestDb()`: sets up the test database for the suite.
- `beforeEach(() => registerTranslationPort(undefined))`: explicitly clears the translation port before every test, instead of relying on module isolation.
- `FALLBACK = 'en'`: the fallback locale, which the file's comment says is `en` in every environment the suite runs in (see `.env-example`).
- `productService.create` tests:
  - A payload with only the fallback language succeeds, and `data.title` is `'Standing Desk'`.
  - A payload that adds `it` returns a 422 with `errors[0].details.field === 'translations.it'`.
- `productService.updateById` test: a PATCH naming only `it` returns a 422 with field `translations.it`.
- `productService.getByIdForCaller` test: for an admin caller, `translations` is built from the product's own columns, as `{ en: { title, description } }`.
- `productService.getById` test: inside `runWithLocale('it', ...)`, it still returns the fallback title.

## Relationships
- `@kernel/translation` (`src/kernel/translation.ts`): provides `registerTranslationPort`. It is reset to `undefined` here, and the file relies on this module's fallback to produce the 422s.
- `@infrastructure/i18n` (`src/infrastructure/i18n/index.ts`): provides `runWithLocale`, used to request the `it` locale in the `getById` test.
- `@infrastructure/http/response` (`src/infrastructure/http/response.ts`): supplies the `ResponseSuccess` and `ResponseReject` types, used to narrow results (`status`, `errors`, `data`).
- `src/modules/products/services/index.ts`: supplies `productService`, the unit under test.
- `src/modules/products/model.ts`: supplies the `ProductDocument` type, used to type the created product's `data`.
- `src/modules/products/tests/factories.ts`: supplies `createProduct`, used to seed products.
- `tests/support/callers.ts`: supplies `testCallerContext` and `callerContextAs('admin')`.
- `tests/support/setup-test-db.ts`: supplies `setupTestDb`.
- `src/infrastructure/i18n/context.ts`: not imported directly. It is presumably the locale-context implementation behind `runWithLocale`.

## Notes
- No `registerModules` call installs a translation port in this file, so the absence of a provider is the condition under test.
- Rejections are asserted as a `ResponseReject` with status 422 and a field-level error detail (`translations.it`), not as a thrown error.
