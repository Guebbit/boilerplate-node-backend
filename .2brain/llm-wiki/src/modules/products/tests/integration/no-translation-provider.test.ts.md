---
source: src/modules/products/tests/integration/no-translation-provider.test.ts
sha256: 216c570b327f8d8e4913f1bb58ca9bbe629fa03046e6f288a6a73c14a925861a
generated_at: 2026-10-15T11:48:25.291563+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/tests/integration/no-translation-provider.test.ts

## Purpose

Integration test suite that verifies `productService` degrades gracefully when no translation port is registered — simulating a deployment where the `locales` module is absent. It asserts that the fallback language (`en`) still reads and writes correctly, and that any request for a non-fallback language produces a field-specific 422 instead of a 500 from a missing port.

## Key elements

- **`beforeEach(() => registerTranslationPort(undefined))`** — Explicitly clears the translation port before every test so the suite never depends on module-load order or a previously installed port.
- **`FALLBACK = 'en'`** — Hardcoded fallback locale; the comment references `.env-example` as the source of truth for why `en` is the fallback in every environment.
- **`writeCreate` block** — Two tests: (1) a payload with only the fallback language succeeds and the title is readable; (2) a payload adding a second language (`it`) returns a 422 with `errors[0].details.field === 'translations.it'`.
- **`writeUpdate` block** — A PATCH that names only a non-fallback language (`it`) returns the same field-named 422.
- **`getAdmin` block** — After creating a product via `createProduct`, the admin view's `translations` map contains exactly one entry keyed by `FALLBACK`, sourced from the product's own columns.
- **`getById` block** — Wraps the read in `runWithLocale('it', …)` to confirm the service still returns the fallback title even when the ambient locale is a non-fallback language.

## Relationships

- **`src/kernel/translation.ts`** — Provides `registerTranslationPort`; the test calls it with `undefined` to simulate an uninstalled port.
- **`src/modules/products/services/index.ts`** — Exports `productService`, the system under test (all four `writeCreate` / `writeUpdate` / `getAdmin` / `getById` calls).
- **`src/modules/products/tests/factories.ts`** — `createProduct` seeds a product row for the update and read tests.
- **`src/infrastructure/i18n/index.ts`** — `runWithLocale` sets the ambient locale context for the `getById` test.
- **`src/infrastructure/http/response.ts`** — `ResponseReject` / `ResponseSuccess` types used to type-cast results and assert on `status`, `errors`, and `data`.
- **`src/modules/products/model.ts`** — `ProductDocument` type for the success-path data assertion.
- **`tests/support/setup-test-db.ts`** — `setupTestDb` initialises the in-memory/test database before the suite runs.
- **`tests/support/callers.ts`** — `testCallerContext` supplies the caller identity required by `writeCreate` and `writeUpdate`.

## Notes

- The suite deliberately avoids a `registerModules` call; the only way to guarantee "no provider" is the explicit `registerTranslationPort(undefined)` in `beforeEach`. Do not remove that line or the tests will silently pass against whatever port a prior test left installed.
- `FALLBACK` is a local constant, not read from environment. If the fallback locale changes in `.env-example`, this file must be updated in lockstep or the tests will assert the wrong key.
- The 422 assertion checks the *field name* in the error detail (`translations.it`), not just the status code. The service is expected to produce a per-field rejection, not a generic one.
