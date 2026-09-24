---
source: src/modules/locales/services/translations.ts
sha256: a6b0c2d73d57d10279b47338bb1c45e71cc641cbde048bc6d112de2b5bc90a5a
generated_at: 2026-09-23T18:52:53.056317+00:00
model: ollama:qwen3.8:27b
---

# src/modules/locales/services/translations.ts

## Purpose

Service-layer door for reading and merging translations on translatable entities (e.g. `product`). Implements a two-phase **plan → write** pattern for PATCH: every locale slot is validated against the `locales` collection and the `translatables` registry before any row is touched, guaranteeing an all-or-nothing edit. Also exposes a GET handler that returns the full translation set in admin wire shape.

## Key elements

- **`EntityTranslationsResult`** — interface for the admin GET response: `entityType`, `entityId`, `translations[]` (wire-shaped), and `fields` (declared by the registry).
- **`planSlot`** _(internal)_ — validates a single locale entry: checks the locale exists and is active, rejects empty fields, rejects undeclared field names, and blocks deletion of the fallback locale.
- **`planTranslationWrites`** _(internal)_ — iterates every slot in a PATCH payload via `planSlot`; returns the full plan or the first rejection.
- **`writePlannedTranslations`** _(internal)_ — applies an already-validated plan (upsert/delete rows), writes the derived index column on the entity document if the fallback locale was upserted, and passes a source digest to non-fallback rows. Does **not** invalidate cache or record audit.
- **`planForPort`** / **`writeForPort`** — thin adapters that reshape the internal plan into the `@kernel/translation` types (`TranslationWritePlan` / `TranslationWriteSlot`), stripping `origin` for the port side.
- **`getEntityTranslations`** — exported GET handler; returns all translation rows via `translationRepository.normalize` plus the registry's declared fields.
- **`upsertEntityTranslations`** — exported PATCH handler; runs plan → write, then invalidates the entity's cache tag, records an `ADMIN_TRANSLATION_UPDATED` audit event, and re-reads rows for the success response.
- **`isRejection`** _(internal)_ — type guard narrowing a `PlannedWrite | ResponseReject` union.
- **`PlannedWrite`** _(internal)_ — discriminated union: `{ kind: 'upsert', fields, origin }` or `{ kind: 'delete' }`.

## Relationships

- **`src/modules/locales/services/translatables.ts`** — calls `translatableTarget(entityType)` to resolve the registry entry (collection, declared fields, cache tag).
- **`src/modules/locales/repository.ts`** — calls `localeRepository.findByTag`, `translationRepository.findEntityTranslations`, `.findEntityLocale`, `.upsertEntityLocale`, `.removeEntityLocale`, `.updateDerivedColumn`, `.normalize`, and `deriveSourceDigest`.
- **`src/infrastructure/i18n/index.ts`** (re-exporting `catalog.ts` / `context.ts`) — imports `getFallbackLocale()` and the `t()` interpolation helper.
- **`src/infrastructure/http/response.ts`** — builds every `ResponseSuccess` / `ResponseReject` envelope via `generateSuccess` / `generateReject`.
- **`src/infrastructure/adapters/cache.ts`** — calls `invalidateCacheTagsLogged` after a successful write in `upsertEntityTranslations`.
- **`src/infrastructure/observability/audit.ts`** — calls `recordAudit` in `upsertEntityTranslations`.
- **`src/modules/locales/audit.ts`** — imports `localeAuditActions.ADMIN_TRANSLATION_UPDATED` for the audit action constant.
- **`src/kernel/translation.ts`** — imports `TranslationWritePlan` and `TranslationWriteSlot` types to shape the port-facing adapters.
- **`src/types/index.ts`** / **`src/types/auth-context.ts`** — imports `Translation`, `TranslationFields`, `TranslationOrigin`, `UpsertTranslationsRequest`, and `CallerContext`.
- **`src/modules/locales/services/index.ts`** — barrel re-export of this module's public API.

## Notes

- **Two-phase contract:** `writePlannedTranslations` never validates. Callers that skip `planTranslationWrites` first risk writing unvalidated data. The public `upsertEntityTranslations` always runs both phases; `writeForPort` assumes the caller already planned via `planForPort`.
- **Cache + audit ownership is split:** `upsertEntityTranslations` (the generic admin door) invalidates cache and records audit. `writePlannedTranslations` deliberately does not, so composite callers (e.g. `productService.write` creating a product + translations in one request) can own those side-effects themselves.
- **Derived column write is centralized** in `writePlannedTranslations`: the fallback-locale fields are projected onto the entity's own collection through `target.collection`, ensuring no caller can forget the invariant.
- **`context` is optional** on `upsertEntityTranslations`; omitting it (as tests do) suppresses both the audit emit and the `translatedBy` stamp.
- **`origin` defaults to `'human'`** in `writeForPort`, since port callers are editors/translators, never machine imports.
