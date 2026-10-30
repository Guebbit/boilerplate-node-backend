---
source: src/modules/locales/tests/contract/translations.contract.test.ts
sha256: d568e5b039a6016699d2d949547d1b35d49cdd23e42869e02e4d0f31ab33662a
generated_at: 2026-10-29T04:25:34.110238+00:00
model: ollama:qwen3.8:27b
---

# src/modules/locales/tests/contract/translations.contract.test.ts

## Purpose

Contract tests for the `/locales/translations/:entityType/:id` endpoint (GET, PATCH, PUT). Validates the wire shape and validation rules for an entity's translated fields. Lives in its own file because `product` is the only entity type registered today — deleting the shop module should remove this file without touching the language or dictionary contract suites.

## Key elements

- **`GET & PATCH /locales/translations/:entityType/:id`** (describe block) — covers:
  - GET returns `{ translations: [] }` for an entity with no rows.
  - PATCH upserts a locale entry and returns the full list.
  - PATCH without `origin` → 422 (merge-patch has no default).
  - GET/PATCH with an unregistered `entityType` → 404.
  - PATCH with prototype-pollution keys (`constructor`, `toString`, `__proto__`) as `entityType` → 404.
  - PATCH with a `null` value for the fallback locale → 422.
- **`PUT /locales/translations/:entityType/:id`** (describe block) — covers:
  - PUT replaces the full set; locales not named in the body are deleted.
  - PUT stores `origin: 'human'` when the caller omits it.
  - PUT that omits the fallback locale → 422.
- **`FALLBACK`** — local constant (`{ tag: 'en', … }`) used to register the fallback language before PUT tests.

## Relationships

- **`tests/support/contract.ts`** — imported as a side-effect (`import '@tests/contract'`); sets up contract-test infrastructure (spec matching helpers, global expectations) before the suite runs.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` is called at module top level to provision a clean database per run.
- **`tests/support/http.ts`** — provides `api()` (supertest-style request builder) and `authenticateAs()` (returns a bearer token for the given role).
- **`src/modules/products/tests/factories.ts`** — `createProduct()` seeds a product row used as the entity under test.
- **`src/modules/locales/tests/contract/support.ts`** — `createLanguage(bearer, [override])` registers a language row (default `pt`; `FALLBACK` override registers `en`).

## Notes

- The file is intentionally **not** colocated with the other `/locales` contract suites. The module docstring states the design intent: removing the product/shop module should take exactly this file with it.
- PUT tests require the fallback locale (`en`) to be registered via `createLanguage` before the request; the comment in the file notes that nothing else in the suite upserts `en`.
- The prototype-pollution cases (`it.each`) are a security guard: any key that resolves to an inherited property on the entity-type registry is treated as unregistered rather than looked up.
- PATCH is a merge-patch (partial), so `origin` is required per entry. PUT is a full replace, so `origin` defaults to `'human'` when absent.
