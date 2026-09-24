---
source: tests/integration/translation-cascades.test.ts
sha256: 030f59c7797caf3205311b93f675d494632d0566b348573d47113e7586524d88
generated_at: 2026-09-23T20:07:59.679144+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/translation-cascades.test.ts

## Purpose

Integration test verifying that translation (locale) rows cascade correctly with product deletion. It exists at the top level rather than under `products/tests/` or `locales/tests/` because the invariant spans two modules: the trigger lives in the product service, the rows live in the locales repository.

## Key elements

- **`beforeAll` → `registerModules(enabledModules)`** — Fires the import-time side effect in the locales module that registers the translation port. Without this, `productService.remove`'s hard-delete branch cannot call `removeTranslations`.
- **Hard-delete test** — Seeds `en` and `it` locale rows, calls `productService.remove(product, true)`, asserts `findEntityTranslations` returns `[]`.
- **Soft-delete test** — Seeds an `en` row, calls `productService.remove(product, false)`, asserts the row survives.
- **Restore test** — Seeds `en` + `it`, calls `remove(product, false)` twice (soft-delete then re-soft-delete), asserts both locales remain.
- **Isolation test** — Creates two products each with an `en` row, hard-deletes one, asserts the other's row is untouched.
- **`createProduct()`** — Factory that inserts a minimal product and returns it with a generated `_id`.

## Relationships

- **`tests/support/setup-test-db.ts`** — Called once at module top; provisions the in-memory or temp database for the suite.
- **`src/modules/products/tests/factories.ts`** — `createProduct` provides the fixture product for each test.
- **`src/modules/products/index.ts`** → **`src/modules/products/service.ts`** — `productService.remove(product, hardDelete)` is the action under test; the hard-delete path internally invokes the translation-removal port.
- **`src/modules/locales/repository.ts`** — `translationRepository.upsertEntityLocale` seeds locale rows; `translationRepository.findEntityTranslations` reads them back for assertions.
- **`src/kernel/registry.ts`** — `registerModules` performs the module wiring that makes the cross-module call possible.
- **`src/modules.ts`** — `enabledModules` is the module list passed to `registerModules`; importing it is what triggers the locales module's import-time registration.

## Notes

- **Module registration is load-bearing.** Neither product nor locales is reached through `src/app.ts` in this test file. The only thing that causes `locales/module.ts` to register its translation port is the `registerModules(enabledModules)` call in `beforeAll`. Remove or reorder that line and the hard-delete test will silently skip the cascade (the port lookup will fail or be a no-op), producing a false pass or a confusing error.
- **No app boot.** This file does not import or start the application; it manually wires just enough of the kernel to exercise one cross-module call path.
- **"Restore" is expressed as a second soft-delete.** `productService.remove(product, false)` is idempotent in the soft-delete sense — calling it on an already-soft-deleted product flips it back. There is no separate `restore` method in the tested API.
