---
source: tests/integration/product-write.test.ts
sha256: 25a9553aaa4fe3924fdd767f418fd7e1fdf5a25dfd2f670e68cfeb3cca5cc72d
generated_at: 2026-09-27T15:57:39.418149+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/product-write.test.ts

## Purpose

Cross-module integration test proving that `productService.writeCreate` and `writeUpdate` correctly write and modify translation rows in a **real database** through the **real translation port**. It lives at the repository top level (not under `products/tests/` or `locales/tests/`) because the trigger is in the products module but the rows and locale validation live in the locales repository. The wiring-only and storage-only halves are covered in each module's own `tests/integration/`; this file covers the combined, both-sides-real case.

## Key elements

- **`beforeAll`** — calls `registerModules([localesModule, productsModule])`, which triggers `localesModule.onRegistered` to resolve `translatables` from the products manifest and install the translation port that `productService` writes through.
- **`beforeEach`** — ensures the `en` fallback locale exists (via `givenLocale`) so the fallback-presence precondition holds for every test.
- **`describe('productService.writeCreate')`** — three cases:
  - Writes product document + all translation rows atomically; verifies rows and the derived `title` index column.
  - Rejects and writes *nothing* (product or rows) when the fallback locale is absent.
  - Rejects and writes *nothing* when a translation references an unregistered locale; surfaces a per-field error on `translations.xx`.
- **`describe('productService.writeUpdate')`** — three cases:
  - A single PATCH edits one locale row and deletes another; verifies only the surviving row remains.
  - Rejects `null` on the fallback locale; existing rows are untouched.
  - A PATCH that carries no `translations` key leaves all rows intact (price-only update).
- **`FALLBACK`** — constant set to `'en'`; the fallback locale for every environment this suite targets (see `.env-example`).

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/kernel/registry.ts` | `registerModules` is called in `beforeAll` to wire the translation port. |
| `src/modules/locales/module.ts` | Registered as a module so its `onRegistered` hook installs `translatables` resolution. |
| `src/modules/locales/repository.ts` | `translationRepository.findEntityTranslations` / `upsertEntityLocale` are used to assert and seed translation rows. |
| `src/modules/locales/tests/factories.ts` | `givenLocale` seeds the required locale records before each test. |
| `src/modules/products/index.ts` | Source of the `productService` import and the `ProductDocument` type. |
| `src/modules/products/module.ts` | Registered alongside locales so its manifest contributes `product` to `translatables`. |
| `src/modules/products/service.ts` | The system under test: `writeCreate` and `writeUpdate`. |
| `src/modules/products/tests/factories.ts` | `createProduct` seeds a product document for the update-path tests. |
| `tests/support/callers.ts` | `testCallerContext` is the caller identity passed to every write call. |
| `tests/support/setup-test-db.ts` | `setupTestDb()` at module top level provisions the real database connection. |

## Notes

- **Placement is intentional.** The file deliberately sits in `tests/integration/` rather than under `products/tests/` or `locales/tests/` because it exercises the seam *between* the two modules. Each module's own integration tests use a fake stand-in for the other side.
- **Registration order matters.** The translation port only exists after *both* modules are registered; registering products alone would leave the port uninstalled and writes would fail.
- **Fallback locale is environment-dependent.** The constant `FALLBACK = 'en'` is hardcoded here but the actual fallback is read from environment config; if the environment changes, this constant and the `beforeEach` seed must be updated in lockstep.
- **Atomicity is the key assertion.** Every rejection test explicitly verifies that *neither* the product document *nor* any translation row was written, confirming the all-or-nothing contract of `writeCreate`/`writeUpdate`.
