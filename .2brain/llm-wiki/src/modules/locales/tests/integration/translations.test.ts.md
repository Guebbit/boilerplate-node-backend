---
source: src/modules/locales/tests/integration/translations.test.ts
sha256: d46a2a682102110278c3f526bb728478b6f347f4e62e7ffa08f333238dadb405
generated_at: 2026-09-27T15:03:24.570804+00:00
model: ollama:qwen3.8:27b
---

# src/modules/locales/tests/integration/translations.test.ts

## Purpose

Integration tests for `localeService.getEntityTranslations` and `localeService.upsertEntityTranslations`, run against a real MongoDB instance. Covers the full translation write/read path: registry validation, `locales` collection checks, derived-index-column writes on the `products` entity, and source-digest stamping on sibling rows.

## Key elements

- **`setupTestDb()`** — spins up a real Mongo connection before the suite runs.
- **`beforeAll` / `afterAll`** — registers translatables via `resolveTranslatables(enabledModules)` and clears them on teardown.
- **`beforeEach`** — seeds the fallback locale `en` (constant `FALLBACK`) as a regular active row.
- **`describe('getEntityTranslations')`** — three cases: unregistered entity type → 422, no rows → empty array, multiple rows sorted by locale tag.
- **`describe('upsertEntityTranslations')`** — the bulk of the file. Validates:
  - Input rejection (unregistered entity, non-existent/inactive locale, nonexistent entity 404, malformed ObjectId, undeclared field, empty `fields`, `null` on fallback).
  - Delete semantics (`null` on a non-fallback locale removes the row).
  - Partial-update semantics (unmentioned locales are left untouched).
  - Batch atomicity (one bad locale in the body → whole batch rejected, zero rows written).
  - Derived-index-column write (only on fallback; non-fallback leaves the target entity column unchanged).
  - Source-digest stamping (sibling rows carry `deriveSourceDigest` of the fallback row; the fallback row itself has none; re-writing the fallback does not re-stamp siblings).
- **Assertions via repositories** — `translationRepository.findEntityTranslations` and `localeRepository` are used directly to verify side-effects (row count, absence of writes, digest values).

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/modules/locales/services/index.ts` | **SUT.** Provides `localeService`; all tested calls go through it. |
| `src/modules/locales/repository.ts` | Provides `localeRepository`, `translationRepository`, and `deriveSourceDigest`, used in setup, assertions, and the D-LO5 row-deletion test. |
| `src/kernel/registry.ts` | `resolveTranslatables` is called in `beforeAll` to register the real translatable targets. |
| `src/modules.ts` | `enabledModules` is passed into `resolveTranslatables` so the registry sees the same modules the app uses. |
| `src/modules/locales/tests/factories.ts` | `givenLocale` seeds locale rows (active or inactive) per test. |
| `src/modules/products/tests/factories.ts` | `createProduct` / `readProduct` create and verify the target entity and its derived index columns. |
| `tests/support/setup-test-db.ts` | `setupTestDb` provisions the in-memory/real Mongo instance for the whole suite. |

## Notes

- **No hand-rolled translatable registration.** The `beforeAll` deliberately uses `resolveTranslatables(enabledModules)` (the same path as `tests/cross-cutting/translatable-targets.test.ts`) to avoid the hidden cross-module coupling removed by decision SD-09. Do not replace it with a literal object.
- **Fallback is a regular row.** The write path does not special-case `en`; it checks existence and activity exactly as it would any locale. The D-LO5 test proves this by *deleting* the seeded `en` row and still writing successfully.
- **Order matters for malformed IDs.** The "rejects rather than writing" test asserts the rejection lands *before* any row write — `target.exists` throws a `BSONError` that the controller's `catchAs` maps to 422.
- **Batch validation is all-or-nothing.** A single unregistered locale in the body fails the entire upsert; no partial rows may appear.
- **Digest is of the fallback row specifically.** `expect(itRow?.sourceDigest).toBe(deriveSourceDigest({ title: 'Bed' }))` pins the exact expected value rather than just checking presence.
- **File uses `mongoose.Types.ObjectId`** to generate a guaranteed-nonexistent ID for the 404 test.
- The file content was truncated in the source provided; the last visible test ("does not re-stamp a sibling row…") is incomplete.
