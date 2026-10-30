---
source: src/modules/products/tests/integration/no-translation-provider.test.ts
sha256: 9621e2129eef7387984126933f3409c6019d4d3ef540e161095dbec93d346354
generated_at: 2026-10-29T05:32:58.448888+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/tests/integration/no-translation-provider.test.ts

## Purpose

Integration test proving that the products service degrades gracefully when no translation port is registered (i.e. the `locales` module is absent in a deployment). It asserts that the fallback language still writes and reads successfully, and that any non-fallback language produces a field-specific 422 rather than a 500 from a missing port.

## Key elements

- **`beforeEach(() => registerTranslationPort(undefined))`** — explicitly resets the translation port for the entire suite, simulating a deployment where `locales` was never installed.
- **`FALLBACK = 'en'`** — constant for the fallback locale, noted as coming from `.env-example`.
- **`productService.create` (2 tests)** — verifies fallback-language write succeeds; verifies a second language yields a 422 with `translations.it` as the field.
- **`productService.updateById` (1 test)** — verifies a PATCH containing only a non-fallback language is rejected with the same 422/field pattern.
- **`productService.getByIdForCaller` (1 test)** — verifies the admin read path builds the fallback tab from the product's own `title`/`description` columns.
- **`productService.getById` (1 test)** — verifies the public read path returns the fallback title even when the requested locale (`it`) differs.

## Relationships

- **`src/kernel/translation.ts`** — imports `registerTranslationPort` and calls it with `undefined` to remove the port; the file's doc comment notes `kernel/translation.ts` provides the fallback answer that produces the 422.
- **`src/modules/products/services/index.ts`** — imports `productService`, the system under test (exposes `create`, `updateById`, `getByIdForCaller`, `getById`, and `zodProductCreateSchema`).
- **`src/modules/products/tests/factories.ts`** — imports `createProduct` to seed a product document before update/read tests.
- **`src/modules/products/model.ts`** — imports `ProductDocument` type for casting `ResponseSuccess` payloads.
- **`src/infrastructure/http/response.ts`** — imports `ResponseReject` / `ResponseSuccess` union types to assert on result shape (`success`, `status`, `errors[].details.field`).
- **`src/infrastructure/i18n/index.ts`** — imports `runWithLocale` to simulate a non-English request in the `getById` test.
- **`tests/support/callers.ts`** — imports `testCallerContext` (default caller) and `callerContextAs('admin')` for the admin read test.
- **`tests/support/setup-test-db.ts`** — calls `setupTestDb()` to provision the test database before the suite runs.

## Notes

- The port is reset via an explicit `registerTranslationPort(undefined)` call, **not** via module isolation. The file deliberately avoids any `registerModules` call so the state matches a real deployment missing the `locales` module.
- `FALLBACK` is hard-coded to `'en'`; if the fallback locale in `.env` changes, this constant and the test expectations must be updated in lockstep.
- The 422 assertion checks `errors[0].details.field === 'translations.it'`, coupling the test to the exact shape of the error payload produced by the kernel translation fallback.
