---
source: src/modules/locales/services/translations.ts
sha256: 6dc06cdd7fedacac9aa8f3a4794157df2488eb5111ea5fe4b51bc6293921f519
generated_at: 2026-11-08T06:26:56.505756+00:00
model: ollama:qwen3.8:27b
---

# src/modules/locales/services/translations.ts

## Purpose

The read/write service for entity translations: validates locale slots against the `locales` collection and the `translatables` registry, then applies the resulting plan (upserts, deletes, and the derived-index-column write) inside a caller-supplied transaction. Generic across any entity type the registry declares; never touches an entity's own collection except through `target.writeDerived`.

## Key elements

- **`EntityTranslationsResult`** — Wire shape returned by the GET/PUT/PATCH controller path: `entityType`, `entityId`, `translations`, and the `fields` list from the registry.
- **`planSlot`** (private) — Validates a single locale entry: rejects `null` on the fallback locale, rejects empty/unknown fields, runs `target.checkFields`, and checks the locale exists in `locales` (skipped for the fallback). Returns a `PlannedWrite` or a 422 rejection.
- **`planTranslationWrites`** (private) — Iterates the full payload, calling `planSlot` per locale; short-circuits on the first rejection. Resolves the `TranslatableTarget` once and returns it alongside the plan.
- **`writePlannedTranslations`** (private) — Applies an already-validated plan: upserts/removes rows via `translationRepository`, computes `fallbackDigest` for non-fallback upserts, and performs the single derived-index-column write (`target.writeDerived`) if the fallback locale was upserted. Joins the caller's `ClientSession`.
- **`planForPort`** (exported) — Adapts `planTranslationWrites` output to the `TranslationWritePlan` shape expected by `@kernel/translation`, stripping `origin` from each upsert slot.
- **`writeForPort`** (exported) — Adapts `writePlannedTranslations` for the kernel port; defaults `origin` to `'human'` since port callers are editors/translators.
- **`entityTypeUnknown` / `entityNotFound` / `slotRejection`** (private) — Shared 404/422 rejection factories using `t()` for i18n'd messages.
- **`isRejection`** (private) — Type guard narrowing the `ResponseReject | PlannedWrite` union.

## Relationships

- **`@kernel/registry`** — Imports `TranslatableTarget`; calls `translatableTarget(entityType)` (re-exported from `./translatables`) to obtain the declared fields, `checkFields` validator, and `writeDerived` writer.
- **`@kernel/translation`** — Imports `TranslationBatch`, `TranslationWritePlan`, `TranslationWriteSlot`; this file is the *implementation* behind the port those types define.
- **`@infrastructure/i18n`** — Calls `getFallbackLocale()` and `t()` for message interpolation.
- **`@infrastructure/http/response`** — Uses `generateReject`, `generateSuccess`, `fieldError` to build API responses.
- **`@infrastructure/adapters/cache`** — Calls `invalidateCacheTagsLogged` (used by the controller path after a successful write).
- **`@infrastructure/runtime/database`** — Calls `withTransaction` to wrap multi-slot writes in a single transaction.
- **`@infrastructure/observability/audit`** — Calls `recordAudit` with actions from `../audit` (`localeAuditActions`).
- **`@infrastructure/object-guards`** — Calls `fillOmittedWithNull` (PATCH normalization).
- **`../repository`** — Uses `localeRepository.findByTag`, `translationRepository.findEntityLocale / upsertEntityLocale / removeEntityLocale`, and `deriveSourceDigest`.
- **`../audit`** — Imports `localeAuditActions` for audit-log action names.
- **`controllers/update-entity-translations.ts`** — The controller that orchestrates `planTranslationWrites` → `writePlannedTranslations` for the generic admin door.

## Notes

- **Two-phase contract:** `planForPort` / `planTranslationWrites` must run before `writeForPort` / `writePlannedTranslations`. The write phase performs *no* validation; skipping the plan step can corrupt data.
- **Fallback-locale delete guard:** `null` on the fallback locale is always rejected (422). This is the only rule that prevents removing the default language row.
- **Inactive locales are writable:** `planSlot` accepts an inactive language as a valid target (drafting); read paths filter them out via `inactiveTags`.
- **Derived-index write is centralized:** `writePlannedTranslations` is the single place that calls `target.writeDerived`, so every door (generic controller, `productService.create`, etc.) gets the same invariant without each caller remembering to write it.
- **Port boundary:** `planForPort` exists because `@kernel/translation` cannot import this module's local `PlannedWrite` type; it re-maps slots to `TranslationWriteSlot`, dropping `origin` (not meaningful for port callers).
- **`origin` default:** Internal callers (e.g. product writes) omit `origin`; the code falls back to `'human'` via `?? 'human'`. The PATCH contract requires it explicitly, so only PUTs or internal batches exercise the default.
