---
source: tests/contract/product-write.test.ts
sha256: dce9ed4fdd2f64ae33246e2b4d0eb55d58d0ee1cea3668dcf7ed470679387ccd
generated_at: 2026-09-23T19:51:59.254602+00:00
model: ollama:qwen3.8:27b
---

# tests/contract/product-write.test.ts

## Purpose

Contract test for the multilingual product write surface over real HTTP: `POST /products`, `PATCH /products/{id}`, and `GET /products/{id}/admin`. It exists at the top-level `tests/contract/` directory (not under `src/modules/products/tests/`) because driving these routes requires a real `locales` collection row, which `products` can only reach through the `kernel/translation.ts` port — a cross-module dependency that the per-module test layout cannot express.

## Key elements

- **`setupTestDb()`** — called at module level to prepare an isolated database for the suite.
- **`beforeAll` / `afterAll`** — registers and clears the translatable field map (`title`, `description` on `products`) via `localeService.setTranslatables`.
- **`FALLBACK` constant** — set to `'en'`; the `beforeEach` block upserts a matching `locales` row so the product write path can resolve the fallback locale.
- **`describe('POST /products')`** — three tests: happy-path creation with translations, 422 when the fallback locale is missing, and a test that an `onHand` value arrives via a real inventory `receive` movement (verified through `GET /inventory/movements`).
- **`describe('PATCH /products/{id}')`** — verifies merged updates (price + translation edit) and a price-only change under the `editor` role.
- **`describe('GET /products/{id}/admin')`** — confirms the admin endpoint returns all stored translations, and that an unauthenticated caller receives 401.
- **`toSatisfyApiSpec()`** — contract assertion (from `tests/support/contract.ts`) applied to every response to validate against the OpenAPI spec.

## Relationships

- **`tests/support/contract.ts`** — provides `toSatisfyApiSpec()` for spec-conformance assertions.
- **`tests/support/http.ts`** — provides `api()`, `authenticateAs()`, `authenticateAsRole()` for real-HTTP requests and auth headers.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` initialises the isolated test database.
- **`src/modules/products/tests/factories.ts`** — `createProduct()` seeds a product for the PATCH and admin-route tests.
- **`src/modules/locales/repository.ts`** — `localeRepository.create()` writes the fallback-locale row in `beforeEach`.
- **`src/modules/locales/factories.ts`** — `makeLocale()` builds the locale document.
- **`src/modules/locales/services/index.ts`** — `localeService.setTranslatables()` wires the translatable-field map the product service reads at runtime.

## Notes

- The `onHand` test uses `authenticateAs('admin')` (not `editor`) because verifying the resulting inventory movement requires the `inventory.any.read` ability, which `editor` does not hold.
- The PATCH authorization comment notes that `products.any.update` and `translations.any.update` are stacked; no preset role holds one without the other, so the single-ability-rejection case is covered by `shared/authorization-conformance.yaml` at the ability layer rather than here.
- `FALLBACK` is hard-coded to `'en'` and assumed stable across all environments this suite runs in (see `.env-example`).
