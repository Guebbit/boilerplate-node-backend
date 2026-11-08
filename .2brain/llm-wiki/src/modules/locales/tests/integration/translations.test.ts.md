---
source: src/modules/locales/tests/integration/translations.test.ts
sha256: bc531b82f718ef4e108060c26f6316333e80ef90160345f7979f862ab7b9ef39
generated_at: 2026-11-08T06:28:42.151624+00:00
model: ollama:qwen3.8:27b
---

# src/modules/locales/tests/integration/translations.test.ts

## Purpose

Integration test suite that exercises `localeService.getEntityTranslations` and `localeService.updateEntityTranslations` against a real MongoDB instance. It validates the full read/write path for entity translations—registry lookup, locale existence checks, derived-index-column writes on `products`, and digest stamping—covering error responses, transaction atomicity, draft/active locale visibility, preview-tag scoping, and orphan-row handling.

## Key elements

- **`beforeAll` / `afterAll`** — Registers the product translatable target via `resolveTranslatables(enabledModules)` so the service resolves the real (not hand-rolled) repository; clears the registry afterward.
- **`beforeEach`** — Guarantees the fallback locale `en` exists as a regular active row in `locales`.
- **`FALLBACK`** — Constant `'en'`; the suite treats it as an ordinary locale row, not a special case.
- **`describe('getEntityTranslations')`** — Tests: 404 for unregistered entity type, empty list for a new entity, and alphabetical locale ordering of returned rows.
- **`describe('updateEntityTranslations')`** — Tests: 404 for unregistered type, 422 for unknown locale, 404 + no-rows-written for a missing entity, rejection-before-write for a malformed ObjectId, transaction rollback when `markEdited` (tag bump) throws, draft-locale write/read/preview semantics, serving text only for the named preview tag, orphan rows (no matching `locales` row) being excluded, fallback locale served even without a `locales` row, and that a message outliving its entity is not returned.

## Relationships

- **`src/kernel/registry.ts`** — `resolveTranslatables` is called in `beforeAll` to obtain the registered translatable targets (including the product's `markEdited` and `writeDerived` methods).
- **`src/modules.ts`** — `enabledModules` is passed into `resolveTranslatables` to enumerate which modules are active.
- **`src/modules/locales/services/index.ts`** — `localeService` is the system under test; its `getEntityTranslations`, `updateEntityTranslations`, and `setTranslatables` methods are the primary API surface exercised.
- **`src/modules/locales/repository.ts`** — `translationRepository` and `localeRepository` are used for direct DB assertions (e.g., confirming no rows were written) and for setup/teardown of locale rows.
- **`src/modules/locales/model.ts`** — `localeModel` is used to simulate a race condition (deleting a locale row directly to test cascade/orphan behavior).
- **`src/modules/locales/tests/factories.ts`** — `givenLocale` creates and persists locale rows for test scenarios.
- **`src/modules/products/tests/factories.ts`** — `createProduct` / `readProduct` produce product fixtures that serve as translation targets.
- **`tests/support/setup-test-db.ts`** — `setupTestDb` establishes the real MongoDB connection before any test runs.

## Notes

- The suite deliberately **does not import the products repository** directly; it relies on the registry-resolved target so that the same cross-module coupling guarded by `tests/cross-cutting/translatable-targets.test.ts` is exercised identically.
- The "tag bump failure" test monkey-patches `markEdited` on the registered target to simulate a transaction abort, then restores the real registry afterward.
- Draft-locale tests use `givenLocale(tag, { active: false })` and verify that `resolveEntityFields` / `findEntityIdsByFieldMatch` exclude the draft unless the matching preview tag is explicitly supplied as the last argument.
- The "orphan" case (`xx` with no `locales` row) is created by calling `translationRepository.upsertEntityLocale` directly, bypassing the service's existence check, to simulate a write racing a language delete.
- All tests run against a real database; there are no service-level mocks (only the targeted `markEdited` override in one case).
