---
source: tests/integration/product-write.test.ts
sha256: 272ed18e6c8a28cb44b1ab34e11f4fc7a44b78fc9415ee2602753572f4e09efa
generated_at: 2026-11-08T09:45:52.119939+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/product-write.test.ts

## Purpose

Top-level integration test that exercises `productService.create` and `productService.updateById` against a real database **and** a real translation port, verifying that product writes correctly create, validate, and modify multilingual translation rows. It lives at the repository `tests/integration/` level (not under either module) because the assertion surface spans both `products` and `locales`.

## Key elements

- **`setupTestDb()`** — boots a real (non-fake) database for the whole suite.
- **`registerModules([localesModule, productsModule])`** — runs in `beforeAll`; triggers locales' `onRegistered`, which reads `product` from products' `translatables` manifest and installs the translation port that `productService` writes through.
- **`FALLBACK = 'en'`** — constant; `beforeEach` seeds this locale via `givenLocale` so every test has a valid fallback to write into.
- **`describe('productService.create')`** — two cases: (1) a valid create writes the product doc plus one translation row per locale in a single operation, and the fallback title is also the derived `title` index column; (2) an unregistered locale in `translations` causes rejection and no rows are written.
- **`describe('productService.updateById')`** — three cases: (1) a PATCH that edits one locale and nulls another applies both atomically (or neither); (2) null on the fallback locale is rejected and all rows stay untouched; (3) a PATCH with no `translations` key leaves existing translation rows unmodified.

## Relationships

| Neighbor | Interaction |
|---|---|
| `tests/support/setup-test-db.ts` | Provides `setupTestDb`, the real-DB harness called at module load. |
| `tests/support/callers.ts` | Provides `testCallerContext`, the authenticated caller token passed to every service call. |
| `src/modules/products/tests/factories.ts` | `createProduct` seeds a product document for the `updateById` cases. |
| `src/modules/products/index.ts` | Exports `productService` and the `ProductDocument` type used in assertions. |
| `src/modules/products/module.ts` | Passed to `registerModules`; its manifest declares `product` in `translatables`, which locales resolves. |
| `src/modules/locales/module.ts` | Passed to `registerModules`; its `onRegistered` hook wires the translation port. |
| `src/modules/locales/repository.ts` | `translationRepository` is used to seed (`upsertEntityLocale`) and to assert (`findEntityTranslations`) translation rows. |
| `src/modules/locales/tests/factories.ts` | `givenLocale` seeds locale records so the translation port can validate them. |
| `src/kernel/registry.ts` | `registerModules` is the registration entry point that links the two modules' lifecycles. |

## Notes

- **Why top-level, not per-module:** the wiring half (a write calls the port) and the storage half (the port's collection persists) are each tested with a fake stand-in in `products/tests/integration/` and `locales/tests/integration/` respectively. Only this file proves the two sides together against real infrastructure.
- **Fallback-locale invariant:** every test case must include at least one write to `en`; omitting it will cause failures that are easy to misread as product bugs. The same convention is documented in `locales/tests/integration/translations.test.ts`.
- **Registration order matters:** `localesModule` must be registered so that its `onRegistered` hook runs *after* `productsModule` is in the registry; otherwise `translatables` resolution finds nothing and the port is never installed.
