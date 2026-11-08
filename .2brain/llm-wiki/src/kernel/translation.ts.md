---
source: src/kernel/translation.ts
sha256: f2307e6f1244dce065496968285f5cde1e1cfd7c9a6f824f609b4331fa0a2a9a
generated_at: 2026-11-08T03:55:37.518238+00:00
model: ollama:qwen3.8:27b
---

# src/kernel/translation.ts

## Purpose

Defines the **translation port**: the kernel-level contract for resolving user-authored content (product titles, category descriptions) into a caller's language and for cascade-removing translation rows on a hard delete. The kernel declares the interface; `modules/locales` registers the concrete implementation, so decorators and other kernel-adjacent code can depend on translation without importing `src/modules/*` and risking a circular dependency. The same port/adapter pattern used by `kernel/authentication.ts`'s `AuthResolver`.

## Key elements

- **`TranslationPort`** (interface) — the full contract: `resolve`, `removeAll`, `search`, `canPreviewDrafts`, `plan`, `write`, `readAll`, `readServed`. Registered once by `modules/locales`.
- **`TranslatedFields`** / **`TranslationFieldChanges`** / **`TranslationBatch`** — core data types. An absent key means "untranslated", never `""`. Writes follow RFC 7396 merge semantics (string sets, `null` clears, absent leaves).
- **`TranslationWriteSlot`** / **`TranslationWritePlan`** — the validated intermediate between `plan` (validate, no write) and `write` (apply, no validate).
- **`registerTranslationPort`** — sets or replaces the port. Passing `undefined` unregisters.
- **`resolveTranslations`** — read-path entry; returns an empty `Map` when unregistered or the id list is empty (callers never branch on wiring).
- **`removeTranslations`** — hard-delete entry; returns `0` when unregistered. Joins the caller's Mongoose transaction via `session`.
- **`searchTranslatedEntityIds`** — search entry; returns `[]` when unregistered.
- **`previewDraftTag`** — reads the ambient request's preview locale from i18n context; `undefined` for workers/snapshots.
- **`canPreviewDraftLanguages`** — delegates to the port; returns `false` when unregistered.
- **`isTranslationAvailable`** — simple `translationPort !== undefined` check for UI affordances.
- **`planTranslations`** — validate-half of a write. Unregistered, falls back to a single fallback-locale upsert; naming any other locale or leaving the fallback slot empty yields a `ResponseReject` (422).

## Relationships

- **`src/infrastructure/i18n/index.ts`** — imports `t`, `getCurrentLocale`, `getFallbackLocale`, `getLocaleContext`, `localeCandidatesFor`. `localeCandidatesFor` is pure locale-chain maths that stays in infrastructure, not in this port.
- **`src/infrastructure/i18n/context.ts`** / **`catalog.ts`** — underlying i18n context and catalog the port's resolve/search paths depend on.
- **`src/infrastructure/http/response.ts`** — imports `fieldError`, `generateReject`, `ResponseReject` for the `plan` validation return type.
- **`src/infrastructure/persistence/versioning.ts`** — imports `carryVersion` for optimistic-concurrency bookkeeping on writes.
- **`src/modules/locales/module.ts`** — calls `registerTranslationPort` from its `onRegistered` hook; the sole production registrar.
- **`src/modules/locales/services/translations.ts`** — implements `TranslationPort` (the adapter side).
- **`src/kernel/middlewares/locale-preview.ts`** — binds the preview tag that `previewDraftTag` later reads.
- **`src/modules/products/services/read.ts`** / **`lookups.ts`** — product read paths that call `resolveTranslations` and `searchTranslatedEntityIds`.
- **`src/modules/orders/services/snapshot.ts`** — order snapshots resolve translations at capture time (no preview tag, so draft text cannot leak into a message that outlives the request).
- **`src/modules/example/services/crud.ts`** — example caller exercising `plan` + `write` in the same transaction as its own entity write.
- **`src/app.ts`** — application bootstrap; indirectly ensures `modules/locales` is loaded so the port is registered before request handling.

## Notes

- **Unregistered is a valid state.** Unit tests that never import `modules/locales` get no-op returns from every entry point by design.
- **`plan` before `write`.** `write` never validates; calling it with an unvalidated plan can corrupt data. `plan` is also entity-id-free, so a caller creating a new entity in the same request can validate translations before the row exists.
- **`removeAll` is hard-delete only.** A soft delete (restore candidate) must not strip translations — a restored product with no translated name is the bug this distinction prevents.
- **`write` never touches the entity's cache tag or audit trail.** The caller writing its own document owns both, in the same transaction. The derived search index column *is* written regardless of caller.
- **`localeCandidatesFor` is deliberately not a port method.** It is pure arithmetic on locale tags and lives next to `getFallbackLocale` in `@infrastructure/i18n`.
