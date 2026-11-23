---
source: src/modules/locales/tests/integration/translations.test.ts
source_sha256: ce02a9376bff20e3d46e088a56afba06d25dc078e499d6f68fca8005896f839a
context_sha256: 1850dd2f48361574fceccae2212a43d9406c09116754471110a2f6b9c8b0c218
generated_at: 2026-11-22T05:50:57.888118+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/locales/tests/integration/translations.test.ts

## Purpose
Integration test suite for `localeService.getEntityTranslations` and `localeService.updateEntityTranslations`, run against a real Mongo database. It covers registry lookup, locale existence/active checks, transactional behaviour, draft-locale visibility, and how translation rows are read back through `translationRepository`.

## Key elements
- `setupTestDb()`: wires up the test database for the suite.
- `beforeAll` / `afterAll`: install the real translatable targets via `localeService.setTranslatables(resolveTranslatables(enabledModules))`, then reset them to `{}`.
- `FALLBACK` (`'en'`) and a `beforeEach` that creates that locale with `givenLocale`, since every case writes the fallback locale at least once.
- `describe('getEntityTranslations')`: covers
  - 404 for an unregistered `entityType`.
  - An empty list for an entity with no rows.
  - 404 for a missing entity.
  - Rows sorted by locale (`de`, `en`, `it`).
- `describe('updateEntityTranslations')`: covers
  - 404 for an unregistered type.
  - 422 for an unknown locale.
  - 404 for a nonexistent entity, with no rows written.
  - A rejection before any write for a malformed entity id.
  - Rollback: no row is written when the target's `markEdited` rejects, because the row write and the tag bump share one transaction.
  - Drafting content in an inactive locale.
  - Draft text is not served by `resolveEntityFields` or found by `findEntityIdsByFieldMatch`, unless a preview names that draft tag as the fifth argument.
  - A draft tag whose language row was deleted serves nothing.
  - Text is served again once the language is set `active`.
  - Rows whose language is a draft or an orphan (`xx`, with no `locales` row) are never served.
  - The fallback locale is served even with no locale row for it (the visible content ends partway through this case).

## Relationships
- `@kernel/registry` (`src/kernel/registry.ts`): `resolveTranslatables` builds the translatable-target map from `enabledModules`.
- `src/modules.ts`: supplies `enabledModules`, imported by relative path.
- `@modules/locales/services` (`src/modules/locales/services/index.ts`): the `localeService` under test.
- `@modules/locales/repository` (`src/modules/locales/repository.ts`): `translationRepository` (`findEntityTranslations`, `resolveEntityFields`, `findEntityIdsByFieldMatch`, `upsertEntityLocale`) and `localeRepository` (`findByTag`, `save`) are used for assertions and setup. `deriveSourceDigest` is also imported.
- `@modules/locales/model` (`src/modules/locales/model.ts`): exports `localeModel`, which is imported and used directly to delete a language row, simulating a language removed outside the cascade.
- `@modules/locales/tests/factories` (`src/modules/locales/tests/factories.ts`): `givenLocale` seeds locales, optionally with `{ active: false }`.
- `@modules/products/tests/factories` (`src/modules/products/tests/factories.ts`): `createProduct` and `readProduct` supply the product entity.
- `@tests/setup-test-db` (`tests/support/setup-test-db.ts`): provides `setupTestDb`.

## Notes
- It uses the real registered `product` target instead of a hand-rolled one. The inline comment says a locales test importing the products repository directly is the hidden cross-module coupling `tests/cross-cutting/translatable-targets.test.ts` guards against.
- The tag-bump failure test swaps in a `product` target with a rejecting `markEdited`, then restores the real targets with `setTranslatables(real)` at the end of the test body. The restore is not in a `finally`, so a failed assertion leaves the stub in place until `afterAll`.
- The malformed-id test asserts a thrown error, not a status code. The comment says the controller's `catchAs` turns it into a 422, and the property being tested is that the rejection comes before any row is written.
- The comment states `en` is the fallback locale in every environment this suite runs in (see `.env-example`).
