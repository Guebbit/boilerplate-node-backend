---
source: src/modules/locales/services/translations.ts
sha256: 6dc06cdd7fedacac9aa8f3a4794157df2488eb5111ea5fe4b51bc6293921f519
generated_at: 2026-10-29T04:25:00.876759+00:00
model: ollama:qwen3.8:27b
---

# src/modules/locales/services/translations.ts

## Purpose

The service-layer "door" for reading and writing an entity's translations. It exposes a generic, registry-driven API (PUT / PATCH / internal batch) that validates every locale slot against the `translatables` registry and the `locales` collection, then applies the writes atomically. It is intentionally split into a **plan** (validate-all) and **apply** (write) phase so callers that embed translations inside a larger entity write (e.g. `productService.create`) can reuse the same pipeline without re-validating.

## Key elements

- **`EntityTranslationsResult`** — the wire-shaped response for GET / PUT / PATCH: `entityType`, `entityId`, `translations`, and the registry-declared `fields` list.
- **`planSlot`** (internal) — validates a single locale entry: rejects fallback-locale deletion, unknown/empty fields, entity-specific `checkFields` violations, and unknown locales; returns a `PlannedWrite` (upsert or delete).
- **`planTranslationWrites`** (internal) — iterates all locale slots via `planSlot`; returns the resolved `TranslatableTarget` plus the full `PlannedWrite[]`, or the first rejection. No entity id is needed, so it works during entity creation.
- **`writePlannedTranslations`** (internal) — applies an already-validated plan: upserts, deletes, computes a `fallbackDigest`, and performs the **derived-index-column write** (`target.writeDerived`) for the fallback locale. Never re-validates.
- **`planForPort`** / **`writeForPort`** — exported adapters that strip `origin` from each slot to match the `@kernel/translation` port types (`TranslationWritePlan`, `TranslationWriteSlot`), which live behind the kernel architectural boundary.
- **`slotRejection`**, **`entityTypeUnknown`**, **`entityNotFound`** — shared 422 / 404 rejection builders using `ERROR_CODES` and i18n `t()`.
- **`isRejection`** — type guard narrowing `ResponseReject | PlannedWrite` unions.

## Relationships

- **`@kernel/translation`** — consumes the port types this file implements; the file's `planForPort` / `writeForPort` are the concrete backing for that port.
- **`@kernel/registry`** — imports `TranslatableTarget`; the registry is the source of truth for which fields an entity type declares and how to write its derived index column.
- **`src/modules/locales/repository.ts`** — uses `translationRepository` (upsert / remove / find per entity-locale) and `localeRepository` (locale existence + active/inactive lookup), plus `deriveSourceDigest`.
- **`src/modules/locales/audit.ts`** — provides `localeAuditActions` used with `recordAudit` on write operations.
- **`@infrastructure/i18n`** — `getFallbackLocale()` and `t()` for the fallback-locale guard and all user-facing error messages.
- **`@infrastructure/http/response`** — `generateReject`, `fieldError`, and the `ResponseReject` / `ResponseSuccess` types used throughout.
- **`@infrastructure/adapters/cache`** — `invalidateCacheTagsLogged` called after a successful write to bust the entity's translation cache.
- **`@infrastructure/runtime/database`** — `withTransaction` wraps multi-slot writes so a batch is all-or-nothing.
- **`@infrastructure/observability/audit`** — `recordAudit` for the audit trail on each write door.
- **`src/modules/locales/controllers/write-entity-translations.ts`** — the HTTP controller that calls the plan-then-write pipeline for the public PUT / PATCH endpoints.
- **`src/modules/locales/module.ts`** — registers this service into the module lifecycle.

## Notes

- **Plan-then-apply is a hard contract.** `writePlannedTranslations` performs zero validation. Calling it without a prior successful `planTranslationWrites` can write invalid data.
- **Derived-index write is centralized.** `target.writeDerived` is invoked inside `writePlannedTranslations`, not by individual callers, so every door (admin, product create, port) gets the same fallback-locale column sync.
- **Kernel wall.** `@kernel/translation` cannot import this module's internal `PlannedWrite` type; `planForPort` / `writeForPort` exist solely to project the internal shape into the port's narrower types (dropping `origin`).
- **Inactive locales are writable on purpose** — they serve as a draft state. Read paths filter them out via `inactiveTags`.
- **Fallback-locale writes skip the `locales` collection lookup**, so translations still work even if the `locales` module is uninstalled (mirrors the fallback path in `kernel/translation.ts`).
- **`origin` defaults to `'human'`** when omitted; only internal callers (product writes) leave it out. The public PATCH contract requires it explicitly.
