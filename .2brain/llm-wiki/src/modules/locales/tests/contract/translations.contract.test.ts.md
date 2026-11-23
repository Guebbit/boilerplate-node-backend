---
source: src/modules/locales/tests/contract/translations.contract.test.ts
source_sha256: 47d814adbd65d657d1e3684735785ccc5934310241dee10ebdad92ac0b4a7a2b
context_sha256: 8a4d738fbb08bf45a606e6333546c971ed72efca64776d8eca87cc9ff4354f0e
generated_at: 2026-11-22T05:49:26.230015+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/locales/tests/contract/translations.contract.test.ts

## Purpose
Contract tests for the `/locales/translations/:entityType/:id` endpoints, which read and write an entity's translated fields through the registered entity types. `products` is the only registered entity type, so these cases are kept in their own file. Removing the shop then removes just this file and leaves the language and dictionary suites intact.

## Key elements
- **`GET & PATCH /locales/translations/:entityType/:id`** (describe block):
  - GET on a product with no rows returns 200 and `translations: []`.
  - PATCH upserts a `pt` locale entry (`fields`, `origin: 'human'`) and returns 200 with one translation.
  - PATCH returns 422 when a locale entry omits `origin`, because a merge patch has no default to apply.
  - An unregistered `entityType` (`bogus`) returns 404.
  - `constructor`, `toString` and `__proto__` as `entityType` return 404 (via `it.each`), since inherited properties are not registered types.
  - PATCH with `{ en: null }` returns 422, because the fallback locale cannot be nulled.
- **`PUT /locales/translations/:entityType/:id`** (describe block):
  - PUT replaces the full set: seeding `en` and `pt`, then PUTting only `en` leaves one translation, `en`.
  - PUT with `origin` omitted stores `origin: 'human'`.
  - PUT that omits the fallback locale `en` returns 422.
- **`FALLBACK`**: `{ tag: 'en', name: 'English', nativeName: 'English' }`. It is passed to `createLanguage` so `en` exists as a real `locales` row.

## Relationships
- `./support` provides `createLanguage(bearer, overrides?)`, which registers a locale. With no second argument it creates `pt`; the tests pass `FALLBACK` to create `en`.
- `@modules/products/tests/factories` provides `createProduct()`, the entity whose `_id` is used in the URLs.
- `@tests/contract` is imported for its side effects, as the shared contract-test setup. The "matching the spec" test names suggest it provides spec-matching checks, but that is not visible in this file.
- `@tests/setup-test-db` provides `setupTestDb()`, called once at module level.
- `@tests/http` provides `api()` (the request client) and `authenticateAs('admin')`, which returns the `bearer` token for the `Authorization` header.

## Notes
- Every slot, the fallback included, is validated against an existing `locales` row. Tests that write `en` must register it first, because nothing else in the suite upserts it.
- PATCH requires `origin` on each locale entry. PUT defaults it to `human`.
- All requests authenticate as `admin`.
