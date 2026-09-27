---
source: src/modules/locales/services/translations.ts
sha256: 304b6abf025508712dfcc4521fb69effb99a4e0958f35b1c67c358a8f9415d65
generated_at: 2026-09-27T15:02:13.290381+00:00
model: ollama:qwen3.8:27b
---

# src/modules/locales/services/translations.ts

## Purpose

Service layer that reads and writes translation data for translatable entities. It enforces a strict **plan-then-apply** pattern: a batch of locale slots is fully validated (field names, locale existence, fallback-locale delete guard) before any single write executes, so a malformed slot can never leave a partial edit. It is generic across whatever the `translatables` registry declares and never touches an entity's own collection except through the derived-index-column write.

## Key elements

- **`EntityTranslationsResult`** – wire-shaped response interface for GET/PUT/PATCH (entity type, id, translations array, declared field names).
- **`planSlot`** – validates a single locale slot: null → delete (blocked for fallback), non-null → field-existence + registry-check → upsert plan. Looks up the `locales` collection for non-fallback locales to confirm the language exists and is active.
- **`planTranslationWrites`** – validates an entire `UpsertTranslationsRequest` batch; returns the resolved `TranslatableTarget`, fallback locale, and array of `PlannedWrite` slots, or the first rejection.
- **`writePlannedTranslations`** – applies an already-validated plan (upserts, deletes, source-digest linking) and performs the single derived-index-column write (`target.writeDerived`) that syncs fallback-locale fields onto the entity's own document.
- **`planForPort` / `writeForPort`** – exported adapters that reshape the internal plan into `TranslationWritePlan` / `TranslationWriteSlot` for the `@kernel/translation` port (which cannot import this module's internal types). `origin` is dropped in the plan and hard-coded to `'human'` in the write.
- **`applyTranslationBatch`** – shared internal used by both the PATCH and PUT handlers: plans the batch, checks `target.exists` for a 404, writes, invalidates cache tags, and emits an audit record.
- **`isRejection`** – type guard that narrows the `PlannedWrite | ResponseReject` union.

## Relationships

- **`src/kernel/registry.ts`** – provides the `TranslatableTarget` type; `translatableTarget(entityType)` (from `./translatables`) resolves the registry entry whose `fields` and `writeDerived` this file uses.
- **`src/kernel/translation.ts`** – defines `TranslationWritePlan` / `TranslationWriteSlot`; `planForPort` and `writeForPort` exist solely to satisfy that port's interface.
- **`src/modules/locales/repository.ts`** – supplies `translationRepository` (upsert/remove/findEntityLocale), `localeRepository` (locale existence + active check), and `deriveSourceDigest`.
- **`src/modules/locales/services/translatables.ts`** – `translatableTarget` maps an entity type to its registry declaration.
- **`src/infrastructure/i18n/index.ts`** – `getFallbackLocale()` and `t()` for fallback-locale resolution and i18n error messages.
- **`src/infrastructure/http/response.ts`** – `generateReject` / `generateSuccess` / `ResponseReject` / `ResponseSuccess` for the standard response envelope.
- **`src/infrastructure/adapters/cache.ts`** – `invalidateCacheTagsLogged` called after a successful write.
- **`src/infrastructure/observability/audit.ts`** + **`src/modules/locales/audit.ts`** – `recordAudit` and `localeAuditActions` for the `ADMIN_TRANSLATION_UPDATED` audit emit.
- **`src/types/index.ts`** / **`src/types/auth-context.ts`** – type definitions for `Translation`, `TranslationFields`, `TranslationOrigin`, `UpsertTranslationsRequest`, `CallerContext`.
- **`src/modules/locales/services/index.ts`** – barrel that re-exports this module's public surface.
- **`src/modules/locales/module.ts`** – wires this service into the locales module's lifecycle.

## Notes

- **Single derived-write point.** The fallback-locale → entity document sync (`target.writeDerived`) lives only inside `writePlannedTranslations`. Callers that own their own document write (e.g. `productService.write`) still route through `writeForPort`, so there is exactly one place that decides when the derived columns update.
- **Fallback locale is special.** It can never be deleted, and writing it skips the `locales`-collection lookup entirely. Once a `locales` collection is removed, the fallback path still works because `kernel/translation.ts` owns that fallback.
- **`origin` is internal.** The port-facing API (`planForPort` / `writeForPort`) omits `origin` from the plan and hard-codes `'human'` on write, since port callers are editors/translators. Internal callers (e.g. machine imports) use `applyTranslationBatch` directly and can pass a different origin per slot.
- **Validation is entity-agnostic.** `planTranslationWrites` never checks whether a specific entity row exists; the 404 check happens in `applyTranslationBatch` *after* validation but *before* any write. This lets the same plan run during a `POST /products` create where the entity does not yet exist.
- **`origin` defaults to `'human'`** in `planSlot` when the request omits it (`value.origin ?? 'human'`).
