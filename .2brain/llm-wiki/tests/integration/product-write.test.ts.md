---
source: tests/integration/product-write.test.ts
sha256: 49ca98bacd026479ff14c29350198bbdcd9b841141bd96e7168b9d686c763641
generated_at: 2026-10-15T12:51:30.193096+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/product-write.test.ts

## Purpose

Integration test for the multilingual product write surface (`writeCreate` / `writeUpdate`). It is the single place where **both** the products module and the locales module run against a real database and a real translation port simultaneously. It is a top-level file (not nested under either module's `tests/`) because the assertion target crosses both modules.

## Key elements

- **`FALLBACK` (`'en'`)** — the fallback locale constant; every test case writes this locale at least once.
- **`beforeAll` → `registerModules([localesModule, productsModule])`** — installs the translation port that products writes through by resolving each module's `translatables` manifest.
- **`beforeEach` → `givenLocale(FALLBACK)`** — seeds the `en` locale so validation passes.
- **`describe('productService.writeCreate')`**
  - *writes product + all translation rows in one operation* — verifies both `en` and `it` rows land in `translationRepository` and that the fallback title is derived onto the product document.
  - *rejects when a translation locale does not exist* — confirms a non-registered locale (`xx`) causes a field-level error and no rows are inserted.
- **`describe('productService.writeUpdate')`**
  - *applies an edit and a deletion from the same PATCH* — `en` row is updated, `it` row is removed, atomically.
  - *rejects `null` on the fallback locale* — deleting `en` is refused; existing rows are untouched.
  - *leaves translations alone when the PATCH carries none* — a price-only update does not alter any translation row.

## Relationships

- **`src/kernel/registry.ts`** — `registerModules` is called to wire the locales module's `onRegistered` hook, which populates the translation port used by the products service.
- **`src/modules/locales/module.ts` / `repository.ts`** — `localesModule` is registered; `translationRepository.findEntityTranslations` / `upsertEntityLocale` are the assertion and setup targets.
- **`src/modules/locales/tests/factories.ts`** — `givenLocale` seeds locale records before each test.
- **`src/modules/products/index.ts` / `model.ts` / `module.ts`** — `productService` (exposed via the barrel) is the system under test; `ProductDocument` is the result type; `productsModule` is registered so its manifest declares `product` as translatable.
- **`src/modules/products/tests/factories.ts`** — `createProduct` builds a product fixture for the update-path tests.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` initialises the real (in-memory) database the suite runs against.
- **`tests/support/callers.ts`** — `testCallerContext` supplies the caller identity required by the write methods.

## Notes

- **Placement is intentional.** The file lives at `tests/integration/` (top level) rather than under `modules/products/tests/` or `modules/locales/tests/` because the contract spans both modules. The wiring-only and storage-only halves are each proven with a fake stand-in in their respective modules' own integration suites; this file covers the "both sides real" case exclusively.
- **`en` is hard-coded as fallback** in every environment this suite targets (see `.env-example`). Adding a new fallback locale without updating this constant will break every case.
- **Every test must write the fallback locale at least once.** This mirrors a convention documented in `locales/tests/integration/translations.test.ts`; violating it will cause the write to reject before the assertion of interest.
- **`zodProductCreateSchema.parse` is called inside the test body** (not as a helper) so that schema-validation failures surface in the test rather than in setup, making the happy-path assertion unambiguous.
