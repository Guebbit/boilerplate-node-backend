---
source: src/modules/products/tests/integration/no-translation-provider.test.ts
sha256: fcb0380e908de830af0ce6b513f626ebdb2341aabf317e0b7be936ce89fad375
generated_at: 2026-09-27T15:34:35.250070+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/tests/integration/no-translation-provider.test.ts

## Purpose

Integration test suite that verifies the `products` service degrades gracefully when no translation port is registered (i.e. the `locales` module is absent). It proves that the fallback locale still reads and writes successfully, and that any other locale produces a field-specific 422 rather than the 500 that the missing port used to throw before the kernel-level fallback was added.

## Key elements

- **`FALLBACK`** — Constant (`'en'`) used as the guaranteed-fallback locale across all assertions. Comment points to `.env-example` as the source of truth.
- **`beforeEach(() => registerTranslationPort(undefined))`** — Explicitly clears the translation port for every test, simulating a deployment where `locales` was never installed.
- **`describe('productService.writeCreate …')`** — Two tests: fallback-only write succeeds; adding a second language (`it`) rejects with `422` and error field `translations.it`.
- **`describe('productService.writeUpdate …')`** — PATCH with only a non-fallback language rejects with `422` / `translations.it`.
- **`describe('productService.getAdmin …')`** — Admin read builds the fallback tab directly from the product's own `title`/`description` columns.
- **`describe('productService.getById …')`** — Public read via `runWithLocale('it', …)` still returns the fallback title.

## Relationships

- **`src/kernel/translation.ts`** — Provides `registerTranslationPort`, which the suite resets to `undefined`; the kernel fallback logic under test lives here.
- **`src/modules/products/service.ts`** — Source of `productService`, the system under test.
- **`src/modules/products/model.ts`** — Supplies the `ProductDocument` type used in the `ResponseSuccess` cast.
- **`src/modules/products/tests/factories.ts`** — Provides `createProduct` for seeding rows.
- **`src/infrastructure/http/response.ts`** — Exports `ResponseReject` / `ResponseSuccess` discriminated-union types used in assertions.
- **`src/infrastructure/i18n/index.ts`** — Exports `runWithLocale`, used to simulate a non-fallback request locale.
- **`tests/support/callers.ts`** — Provides `testCallerContext` passed as the actor argument to every service call.
- **`tests/support/setup-test-db.ts`** — Provides `setupTestDb` called once at module scope to provision the test database.

## Notes

- The port reset is done **per-test** in `beforeEach` rather than relying on Jest module isolation; this is intentional and called out in the file-level doc comment so future readers don't "simplify" it away.
- `FALLBACK` is hardcoded to `'en'`. If the fallback locale changes in `.env-example`, every assertion in this file must be updated in lockstep.
- The file references feature-step identifiers (`LOCALES_OPTIONAL_0925 step 3c`, `LOCALES_OPTIONAL step 3a`) in the doc comment as provenance for *why* this behavior is expected.
