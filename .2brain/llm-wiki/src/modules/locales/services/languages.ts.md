---
source: src/modules/locales/services/languages.ts
sha256: 32fb5c8fc764561f3bbc3e607e47dffbed7d9355445f290b140e447569512eba
generated_at: 2026-11-08T06:26:06.238543+00:00
model: ollama:qwen3.8:27b
---

# src/modules/locales/services/languages.ts

## Purpose

Service layer for the dynamic language tier: creating, editing, activating/deactivating, and cascade-deleting a language row. It also centralises two cross-file validation rules shared by sibling services — refusing writes under an unknown app and protecting the deployment's fallback locale from deactivation or deletion.

## Key elements

- **`createLanguage(payload, context?)`** – Registers a new language. Checks for an existing tag (409), inserts via the repository, emits `ADMIN_LOCALE_CREATED` audit, and refreshes the overlay.
- **`updateLanguage(tag, payload, context?)`** – Edits display fields (`name`, `nativeName`, `direction`). Uses selective assignment (`!== undefined`) so a partial payload doesn't blank the other fields. `active` is deliberately **not** editable here. Emits `ADMIN_LOCALE_UPDATED`.
- **`activateLanguage(tag, context?)` / `deactivateLanguage(tag, context?)`** – Thin wrappers over the internal `setActive`. Refuse a no-op state change (409) and, on deactivation, refuse if the tag is the fallback locale. Clear translatable caches and refresh the overlay on success.
- **`removeLanguage(tag, context?)`** – Cascade-deletes the language, its entries, and all translations. Refuses if the tag is the fallback locale. Returns `{ removedEntries, removedTranslations }`. Clears translatable caches and refreshes the overlay.
- **`languageNotFound()`** – Shared 404 rejection used by every route in this module.
- **`rejectUnknownApp(app)`** *(exported)* – Returns a 422 rejection if `isKnownApp` fails; `undefined` otherwise. Consumed by sibling services that write translations under an app id.
- **`rejectFallbackLocale(tag)`** *(internal)* – Returns a 409 rejection if the tag equals `getFallbackLocale()`; `undefined` otherwise.
- **`clearTranslatableCaches()`** *(internal)* – Invalidates every cache tag that may carry translated entity text (via `invalidateCacheTagsLogged` + `translatableCacheTags`).

## Relationships

- **`@infrastructure/http/response`** – All success/reject envelopes are built with `generateSuccess` / `generateReject`; return types are `ResponseSuccess<T> | ResponseReject`.
- **`@infrastructure/i18n`** (barrel) – `getFallbackLocale` identifies the protected tag; `t` localises every user-facing error message.
- **`@infrastructure/observability/audit`** – `recordAudit` writes the audit row for every successful mutation (context may be `undefined` in tests, suppressing the emit).
- **`@infrastructure/observability/audit-changes`** – `auditChanges` computes the field-diff metadata attached to the `ADMIN_LOCALE_UPDATED` audit entry.
- **`../model`** – `normalizeTag` normalises the incoming tag; `LocaleDocument` is the domain shape returned to callers.
- **`../repository`** – `localeRepository` supplies all persistence (`findByTag`, `create`, `save`, `deleteLocaleCascade`).
- **`../apps`** – `isKnownApp` validates the app identifier before any write.
- **`../audit`** – `localeAuditActions` provides the stable action-string constants (`ADMIN_LOCALE_CREATED`, `_UPDATED`, `_ACTIVATED`, `_DEACTIVATED`, `_DELETED`).
- **`@infrastructure/adapters/cache`** – `invalidateCacheTagsLogged` performs the actual cache invalidation after any mutation.
- **`./overlay`** (sibling, not in graph list) – `refreshOverlayNow` immediately updates this worker's in-memory served-language list.
- **`./translatables`** (sibling, not in graph list) – `translatableCacheTags` enumerates which cache tags hold translated entity text.
- **`services/index.ts`** – Re-exports the public functions from this module so route handlers import from the barrel.

## Notes

- **Selective update semantics:** In `updateLanguage`, a field set to `undefined` in the payload is left untouched. A blanket object-spread assignment would silently clear unmentioned fields — the code tests each field individually.
- **`active` is write-protected in `updateLanguage`:** Toggling the active flag is exclusively the job of `activateLanguage` / `deactivateLanguage`, which add the no-op guard, fallback guard, cache clear, and a dedicated audit action.
- **Duplicate-tag race:** `createLanguage` checks for an existing tag at the app level for a friendly 409, but relies on a DB unique index as the real guard against concurrent inserts (E11000 → 409 via the shared error interpreter).
- **Optional `context`:** Every exported mutation accepts `context?: CallerContext`. Omitting it (as tests do) simply skips the audit emit — no other behavior changes.
- **Cache vs. overlay refresh:** Every mutation both clears translatable response caches *and* calls `refreshOverlayNow()`. The former prevents stale translated text from being served; the latter ensures this worker's negotiation list reflects the change immediately rather than waiting for a periodic timer.
