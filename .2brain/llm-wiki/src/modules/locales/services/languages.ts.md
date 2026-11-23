---
source: src/modules/locales/services/languages.ts
source_sha256: 8a47c48dded3c93b1bce8e01df0bf8040ca570a59857e1840214cb9aecf8983a
context_sha256: facba21622125841ad3b6c33c5bf7f993bd2d300e07c29eaada17af05dcc88fd
generated_at: 2026-11-22T05:48:00.808116+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/locales/services/languages.ts

## Purpose
Service layer for language (locale) rows: registering, editing, activating/deactivating, and deleting a language together with everything translated into it. It also hosts the shared rules other files in the module reuse: the standard "language not found" rejection, and refusing writes under an unknown app.

## Key elements
- `languageNotFound()` – 404 `LOCALE_LANGUAGE_NOT_FOUND` rejection, used by every route in the module.
- `rejectUnknownApp(app)` – returns a 422 `LOCALE_APP_UNKNOWN` rejection if `isKnownApp(app)` fails, else `undefined`. Applies to writes only; reads filtered by an unknown app just return an empty page.
- `createLanguage(payload, context?)` – normalizes the tag, rejects a duplicate with 409 `LOCALE_LANGUAGE_EXISTS`, creates the row (trimmed names, default direction `ltr`, default `active: true`), audits `ADMIN_LOCALE_CREATED`, refreshes the overlay, returns 201.
- `updateLanguage(tag, payload, context?)` – edits only `name`, `nativeName` and `direction`, and only the fields provided. Builds audit metadata via `auditChanges` before mutating, saves, audits `ADMIN_LOCALE_UPDATED`, then refreshes the overlay.
- `activateLanguage` / `deactivateLanguage` – thin wrappers over the private `setActive`.
- `setActive` (private) – the only place `active` changes after creation. Returns 409 if the language is already in the requested state, and 409 `LOCALE_LANGUAGE_IS_FALLBACK` when deactivating the fallback locale. It saves, clears translatable caches, audits activated/deactivated with a `{ changes: { active: { from, to } } }` payload, and refreshes the overlay.
- `removeLanguage(tag, context?)` – refuses the fallback locale, calls `localeRepository.deleteLocaleCascade`, clears translatable caches, audits `ADMIN_LOCALE_DELETED` with `removedEntries` and `removedTranslations` counts, refreshes the overlay, and returns those counts.
- `rejectFallbackLocale` and `clearTranslatableCaches` (private) – the fallback guard and the cache-tag invalidation helper.

## Relationships
- `../repository` (`localeRepository`): all persistence (`findByTag`, `create`, `save`, `deleteLocaleCascade`).
- `../model`: `normalizeTag` and the `LocaleDocument` type.
- `../apps`: `isKnownApp` backs `rejectUnknownApp`.
- `../audit` plus `infrastructure/observability/audit` and `audit-changes`: `localeAuditActions`, `recordAudit` and `auditChanges` produce the audit trail.
- `@infrastructure/i18n`: `t` for messages and `getFallbackLocale` for the fallback guard.
- `@infrastructure/http/response`: `generateSuccess` / `generateReject` build every return value.
- `@infrastructure/adapters/cache`: `invalidateCacheTagsLogged` is used with `translatableCacheTags()` from `./translatables`.
- `./overlay`: `refreshOverlayNow` is called after each mutation so this worker's in-memory served-language list updates immediately.
- Sibling services (`entries`, `messages`, `capabilities`, `index`) share `languageNotFound` and `rejectUnknownApp`, as the module header describes.

## Notes
- Audit emission is skipped when `context` is omitted, which is what tests calling these as plain helpers do.
- The unique index on tag backs the duplicate-tag check, so a concurrent create race reaches E11000, which the shared interpreter answers with 409.
- Cache clearing happens after save/cascade but before the audit and overlay refresh. It is needed because translated text is cached by language for an hour.
- Deleting an active language is allowed directly; any confirmation step is left to the client.
