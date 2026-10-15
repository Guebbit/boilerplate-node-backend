---
source: src/kernel/translation.ts
sha256: e36a9fd89fe52fa502fd24caebcb3878dc5fbb86c7a27980a1a9b314baa85bbf
generated_at: 2026-10-15T09:52:31.846104+00:00
model: ollama:qwen3.8:27b
---

# src/kernel/translation.ts

## Purpose

Defines the kernel-level port (hexagonal contract) for user-authored translated content — product titles, category descriptions, etc. — covering resolution, search, write, and hard-delete removal. It exists so that kernel decorators and product lifecycle code can depend on translation operations without importing from `src/modules/*`, thereby avoiding a circular dependency. The port is registered by `modules/locales`; until registration, every entry point degrades to a safe no-op or a monolingual fallback.

## Key elements

- **`TranslationPort`** — the interface `modules/locales` must implement: `resolve`, `removeAll`, `search`, `plan`, `write`, `readAll`.
- **`TranslatedFields`** — resolved field map for one entity in one locale; absent key means untranslated (never `""`).
- **`TranslationFieldChanges`** — RFC 7396 merge shape for a single locale's write (string sets, `null` clears, absent leaves).
- **`TranslationBatch`** — multi-locale write payload; `null` value means "delete that locale's row."
- **`clearOmittedFields`** — pure helper that converts a PUT into a full PATCH by filling omitted declared fields with `null`.
- **`TranslationWriteSlot` / `TranslationWritePlan`** — validated write plan (upsert or delete per locale) consumed by `write`.
- **`registerTranslationPort`** — sets (or clears) the singleton port instance.
- **`resolveTranslations`** — read-path entry; returns empty `Map` when unregistered or batch is empty.
- **`removeTranslations`** — hard-delete entry; returns `0` when unregistered.
- **`searchTranslatedEntityIds`** — search entry; returns `[]` when unregistered.
- **`planTranslations`** — validate half of a write; when unregistered, restricts to fallback-locale-only and 422s any other locale.
- **`isTranslationPlan`** — type guard narrowing `TranslationWritePlan | ResponseReject`.
- **`isTranslationAvailable`** — boolean check for UI affordances (e.g., language tabs).

## Relationships

- **`src/infrastructure/i18n/index.ts`** — imports `t`, `getCurrentLocale`, `getFallbackLocale`, `localeCandidatesFor`; used in the unregistered fallback path and for error messages.
- **`src/infrastructure/http/response.ts`** — imports `fieldError`, `generateReject`, and the `ResponseReject` type; used in `planTranslations`' 422 responses and as the rejection half of every `plan` return.
- **`src/infrastructure/persistence/versioning.ts`** — imports `carryVersion`; used by the write path to propagate document version.
- **`src/modules/locales/module.ts`** — registers the concrete `TranslationPort` implementation at boot; the kernel file never imports it back.
- **`src/modules/locales/services/translations.ts`** — provides the `resolve`, `removeAll`, `search`, `plan`, `write`, `readAll` implementations that satisfy the port.
- **`src/modules/products/services/remove.ts`** — calls `removeTranslations` during a product hard delete.
- **`src/modules/products/services/read.ts`** — calls `resolveTranslations` to hydrate translated fields on the read path.
- **`src/modules/products/services/search.ts`** — calls `searchTranslatedEntityIds` to union free-text matches against translated content.
- **`src/modules/orders/services/snapshot.ts`** — calls `resolveTranslations` to capture translated values into an order snapshot.
- **`src/app.ts`** — boots the application and triggers `modules/locales` registration, making the port available.

## Notes

- **Unregistered is a valid state.** Unit tests that never import `modules/locales` get no-op returns (empty map, 0, `[]`) and a monolingual `planTranslations` fallback. Callers never branch on registration themselves.
- **`write` never validates.** A caller that skips `planTranslations` can corrupt data. The type guard `isTranslationPlan` exists specifically to enforce the plan-then-write ordering.
- **`removeAll` is hard-delete only.** A soft delete must not cascade translations, because a restored product with no translated name is the failure mode this port prevents.
- **`localeCandidatesFor` is deliberately absent here.** It is pure locale-chain math and lives in `@infrastructure/i18n` alongside `getFallbackLocale`, per the module docblock.
- **Singleton, mutable, replaced wholesale.** The port is a module-level `let`; `registerTranslationPort` overwrites it. There is no DI container — the registration call *is* the injection.
- **`origin` is stripped from the write plan.** `TranslationWriteSlot` carries no `origin` field; that concept belongs to the generic machine-translation path, not to an editor's own write. The implementation in `modules/locales` defaults it.
