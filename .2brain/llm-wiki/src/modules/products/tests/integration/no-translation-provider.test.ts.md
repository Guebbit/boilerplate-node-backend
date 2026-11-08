---
source: src/modules/products/tests/integration/no-translation-provider.test.ts
sha256: a9bd1d56110910afc707dc26facee8ad394bdc0e29fd5a7ade4ee320dfd7ef29
generated_at: 2026-11-08T07:51:53.296224+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/tests/integration/no-translation-provider.test.ts

## Purpose

Integration test suite that simulates a deployment where the `locales` module is entirely uninstalled (no translation port registered). It verifies that the products service degrades gracefully: the fallback language (`en`) still works for reads and writes, and any non-fallback language produces a structured 422 response rather than a 500 from a missing port.

## Key elements

- **`beforeEach` hook** — calls `registerTranslationPort(undefined)` to explicitly strip the translation port for every test, making the "no provider" condition deterministic regardless of module load order.
- **`FALLBACK`** — constant set to `'en'`, the fallback locale used throughout assertions.
- **`describe('productService.create — no translation provider')`** — two tests: writing only the fallback language succeeds; including a second language (`it`) yields a 422 with the offending field named `translations.it`.
- **`describe('productService.updateById — no translation provider')`** — a PATCH that names only a non-fallback language is rejected with a 422 on `translations.it`.
- **`describe('productService.getByIdForCaller — no translation provider')`** — admin read builds the fallback tab from the product's own columns (title, description) without needing a provider.
- **`describe('productService.getById — no translation provider')`** — public read under `runWithLocale('it', …)` still returns the fallback title.

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/modules/products/services/index.ts` | `productService` is the system under test (create, updateById, getByIdForCaller, getById). |
| `src/kernel/translation.ts` | `registerTranslationPort` is called with `undefined` to remove the port for the entire suite. |
| `src/modules/products/tests/factories.ts` | `createProduct` seeds test documents before update/read tests. |
| `tests/support/callers.ts` | `testCallerContext` (generic caller) and `callerContextAs('admin')` supply permission-scoped caller objects. |
| `tests/support/setup-test-db.ts` | `setupTestDb()` initialises the in-memory/ephemeral database before tests run. |
| `src/infrastructure/i18n/index.ts` | `runWithLocale` wraps the `getById` call to simulate a non-fallback `Accept-Language`. |
| `src/infrastructure/http/response.ts` | `ResponseReject` / `ResponseSuccess` types used in result assertions. |
| `src/modules/products/model.ts` | `ProductDocument` type referenced in the success-case assertion. |

## Notes

- The file does **not** call `registerModules` or import the `locales` module; the absence of a provider is enforced by the explicit `registerTranslationPort(undefined)` reset, not by import graph isolation. This matters if test runners share module registries.
- The fallback locale is hard-coded to `'en'` on the assumption that every environment (including CI) configures it that way; see `.env-example` for the canonical default.
- `productService.zodProductCreateSchema.parse(…)` is used to exercise the same validation path a real HTTP handler would, even though this is a service-level test.
