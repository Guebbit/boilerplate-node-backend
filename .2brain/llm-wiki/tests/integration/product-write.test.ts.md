---
source: tests/integration/product-write.test.ts
sha256: 72c2429cb7276379ad110d13625c2149d55043d42d964e1f249a1175934decd5
generated_at: 2026-10-29T07:01:06.439251+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/product-write.test.ts

## Purpose

Integration test for the multilingual product write surface (`productService.create` / `productService.updateById`). It exercises the full path—service → translation port → real database—across **both** the `products` and `locales` modules simultaneously. Because the trigger lives in `products` but the rows and locale validation live in `locales`, the file sits at the top-level `tests/integration/` rather than under either module's own `tests/` directory.

## Key elements

- **`setupTestDb()`** — called at module scope to establish a real (non-mocked) database connection before any test runs.
- **`beforeAll`** — calls `registerModules([localesModule, productsModule])`; this triggers locales' `onRegistered` hook, which reads `productsModule`'s manifest (declared `product` entity) and installs the translation port that `products` writes through.
- **`beforeEach`** — seeds the fallback locale (`'en'`) via `givenLocale` so every test has at least one valid locale to work with.
- **`FALLBACK`** — constant `'en'`; matches the fallback locale in `.env-example`.
- **`describe('productService.create')`** — two cases: (1) a valid multi-locale create writes the product doc *and* every translation row, with the fallback title copied onto the document's index column; (2) an unknown locale in `translations` causes rejection and **zero** rows written.
- **`describe('productService.updateById')`** — three cases: (1) a PATCH that edits one locale and nulls another is atomic (both applied or neither); (2) nulling the fallback locale is rejected and leaves all rows untouched; (3) a PATCH that omits `translations` entirely does not touch any translation rows.
- Assertions read back via `translationRepository.findEntityTranslations` to verify row-level storage, and via `productService.search` to confirm no spurious product documents were created.

## Relationships

- **`src/kernel/registry.ts`** — `registerModules` wires the translation port; without this call the products module has no port to write through.
- **`src/modules/locales/module.ts`** — passed to `registerModules`; its `onRegistered` lifecycle hook is what activates the port.
- **`src/modules/locales/repository.ts`** — `translationRepository` is used both to seed pre-existing rows (via `upsertEntityLocale`) and to assert row state after each operation.
- **`src/modules/locales/tests/factories.ts`** — `givenLocale` creates locale records the service will validate against.
- **`src/modules/products/index.ts`** — re-exports `productService` and the `ProductDocument` type used in assertions.
- **`src/modules/products/module.ts`** — its `translatables` manifest entry (`product`) is what makes the port target this entity.
- **`src/modules/products/services/index.ts`** — source of `productService` (`.create`, `.updateById`, `.search`, `.zodProductCreateSchema`), the system under test.
- **`src/modules/products/tests/factories.ts`** — `createProduct` seeds a product document for the `updateById` cases.
- **`tests/support/callers.ts`** — `testCallerContext` supplies the caller identity required by every service call.
- **`tests/support/setup-test-db.ts`** — `setupTestDb` initialises the real database connection for the suite.

## Notes

- **Scope boundary:** The wiring half (a write *calls* the port) and the storage half (the port's *own* collection persists correctly) are each covered in the `products` and `locales` modules' own `tests/integration/` suites using fakes for the other side. Only the real-database, both-sides-together case lives here.
- **Fallback locale is special:** The fallback row (`en`) is duplicated onto the product document as an index column (`title`). Deleting it via `null` is explicitly forbidden; the test asserts rejection.
- **`translations` field semantics in PATCH:** `null` for a key = delete that locale's row; key omitted = leave all existing rows unchanged. Omitting the entire `translations` field is the third case (no-op for translations).
- **Zod parse in tests:** `productService.zodProductCreateSchema.parse(...)` is called before `create` so the test documents the expected input shape and catches schema drift early.
