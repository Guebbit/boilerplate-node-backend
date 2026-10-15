---
source: src/modules/locales/services/translations.ts
sha256: 036ede5a4e30b507d3a3b011e09072f2ec5b305c0efe85b02aaab98d8f153b1e
generated_at: 2026-10-15T10:47:00.934182+00:00
model: ollama:qwen3.8:27b
---

# src/modules/locales/services/translations.ts

## Purpose

The service layer for reading and writing locale translations on any translatable entity. It owns the validate-then-apply pipeline for PUT (replace) and PATCH (merge) translation payloads, enforcing per-slot rules (locale exists and is active, fields are registered, fallback-locale cannot be deleted, entity-level field checks) before any repository write occurs. It also exposes two thin port adapters (`planForPort`, `writeForPort`) so the kernel translation port can drive the same logic without importing this module's internal types.

## Key elements

- **`EntityTranslationsResult`** — the admin-facing GET/PUT/PATCH response shape; `translations` is already wire-shaped (no `.toJSON()` needed by controllers).
- **`planSlot`** *(private)* — validates a single locale entry: `null` → delete (blocked for fallback), otherwise checks field count, unknown-field detection, entity-level `checkFields`, and (non-fallback) locale existence/active status via `localeRepository`.
- **`planTranslationWrites`** *(private)* — iterates all slots, returns the first rejection or the full `PlannedWrite[]` plus the resolved `TranslatableTarget` and fallback locale.
- **`writePlannedTranslations`** *(private)* — applies an already-validated plan: upserts/removes rows via `translationRepository`, computes a source digest for the fallback row, and performs the single derived-index write (`target.writeDerived`) as a central invariant.
- **`planForPort`** *(exported)* — maps the internal plan to `TranslationWritePlan`, stripping `origin` to satisfy the kernel port's type wall.
- **`writeForPort`** *(exported)* — maps `TranslationWriteSlot[]` back to internal `PlannedWrite[]`, defaulting `origin` to `'human'`.
- **`isRejection`** *(private)* — type guard narrowing the `ResponseReject | PlannedWrite` union.
- **`upsertEntityTranslations` / `replaceEntityTranslations`** *(truncated, exported)* — the PATCH and PUT entry points that call `planTranslationWrites` + `writePlannedTranslations`, wrapped in `withTransaction`, cache invalidation, and `recordAudit`.
- **`slotRejection`, `entityTypeUnknown`, `entityNotFound`** *(private)* — standardised 422/404 rejection builders.

## Relationships

- **`src/kernel/translation.ts`** — provides the `TranslationWritePlan` / `TranslationWriteSlot` types and `clearOmittedFields`; this file is the concrete implementation behind that port (the "wall" the kernel cannot cross in the other direction).
- **`src/kernel/registry.ts`** — supplies the `TranslatableTarget` type; the concrete target is resolved via `./translatables`.
- **`src/infrastructure/i18n/index.ts`** (→ `catalog.ts`, `context.ts`) — `getFallbackLocale()` and `t()` for locale resolution and user-facing error messages.
- **`src/infrastructure/http/response.ts`** — `generateReject`, `generateSuccess`, `fieldError` for all response shapes.
- **`src/infrastructure/adapters/cache.ts`** — `invalidateCacheTagsLogged` called after successful writes (truncated section).
- **`src/infrastructure/runtime/database.ts`** — `withTransaction` wraps the write phase.
- **`src/infrastructure/observability/audit.ts`** — `recordAudit` for audit trail entries.
- **`src/modules/locales/repository.ts`** — `translationRepository` (upsert/remove/find), `localeRepository` (findByTag), `deriveSourceDigest`.
- **`src/modules/locales/audit.ts`** — `localeAuditActions` enum for audit action identifiers.
- **`src/modules/locales/controllers/write-entity-translations.ts`** — HTTP controller that delegates to this service's exported write functions.
- **`src/modules/locales/services/index.ts`** — barrel re-export for downstream consumers.

## Notes

- **Validate-all-then-write:** every slot is validated before any repository call, so a single bad locale never leaves a partial edit.
- **`writePlannedTranslations` never validates.** Calling it without a prior `planTranslationWrites` (or `planForPort`) can write invalid data.
- **Fallback-locale delete is hard-blocked** at the slot level; the `locales` collection is not consulted for the fallback locale at all (it survives even if `locales` is uninstalled).
- **The derived-index write is centralised** in `writePlannedTranslations` via `target.writeDerived` — callers must not duplicate it.
- **Port adapters strip `origin`:** the kernel port's type intentionally omits it; `writeForPort` re-injects `'human'` as a fixed default.
- **`translatableTarget` comes from `./translatables`**, not directly from the registry — the registry only contributes the `TranslatableTarget` type.
