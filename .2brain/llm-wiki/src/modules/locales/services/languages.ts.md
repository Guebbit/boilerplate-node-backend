---
source: src/modules/locales/services/languages.ts
sha256: 32fb5c8fc764561f3bbc3e607e47dffbed7d9355445f290b140e447569512eba
generated_at: 2026-10-29T04:24:08.830436+00:00
model: ollama:qwen3.8:27b
---

# src/modules/locales/services/languages.ts

## Purpose

Service layer for the CRUD lifecycle of language rows (register, edit, activate/deactivate, delete) in the locales module. It owns the cross-cutting guard that rejects writes targeting an app this deployment does not recognize, and it centralises the fallback-locale protection so no operator can accidentally deactivate or delete the locale every translatable entity's source row lives in.

## Key elements

- **`createLanguage(payload, context?)`** – Registers a new language. Checks for an existing tag (advisory; the unique index is the real race guard), persists the row, records an `ADMIN_LOCALE_CREATED` audit, and refreshes the overlay.
- **`updateLanguage(tag, payload, context?)`** – Edits `name`, `nativeName`, and/or `direction`. Uses field-by-field assignment so an `undefined` field is left untouched. Does **not** touch `active`. Records `ADMIN_LOCALE_UPDATED` audit with a diff produced by `auditChanges`.
- **`activateLanguage(tag, context?)`** / **`deactivateLanguage(tag, context?)`** – Public entry points that delegate to the private `setActive`. Refuse a no-op state change (409) and, for deactivation, refuse if the tag is the fallback. Invalidate translatable caches and refresh the overlay.
- **`removeLanguage(tag, context?)`** – Deletes the language and cascades (entries + translations). Refuses the fallback. Returns `{ removedEntries, removedTranslations }` counts. Invalidates caches and refreshes the overlay.
- **`rejectUnknownApp(app)`** *(exported)* – Shared guard: returns a 422 rejection if `isKnownApp` fails, otherwise `undefined`. Other service files in this module reuse it on their write paths.
- **`languageNotFound()`** *(exported)* – Canonical 404 rejection shape for every language route in this module.
- **`rejectFallbackLocale(tag)`** *(private)* – Returns a 409 rejection if the tag matches the deployment's fallback locale; `undefined` otherwise.
- **`clearTranslatableCaches()`** *(private)* – Calls `invalidateCacheTagsLogged(translatableCacheTags())` to drop any cached response that may carry translated entity text.

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/infrastructure/http/response.ts` | All return values are built with `generateSuccess` / `generateReject` from this module. |
| `src/infrastructure/i18n/index.ts` | Imports `getFallbackLocale` (fallback guard) and `t` (localised error messages). |
| `src/infrastructure/adapters/cache.ts` | Calls `invalidateCacheTagsLogged` after every mutation to evict stale translated-text caches. |
| `src/infrastructure/observability/audit.ts` | Calls `recordAudit` on every successful mutation. |
| `src/infrastructure/observability/audit-changes.ts` | Calls `auditChanges` inside `updateLanguage` to build the diff metadata. |
| `src/modules/locales/repository.ts` | All persistence goes through `localeRepository` (`findByTag`, `create`, `save`, `deleteLocaleCascade`). |
| `src/modules/locales/model.ts` | Uses `normalizeTag` for input normalisation and `LocaleDocument` as the domain type. |
| `src/modules/locales/apps.ts` | Calls `isKnownApp` to gate writes under unknown apps. |
| `src/modules/locales/audit.ts` | Reads `localeAuditActions` enum values for every audit emit. |

## Notes

- **`active` is never set by `updateLanguage`.** Activation/deactivation has its own 409 refusals, fallback guard, cache clear, and audit action. Mixing the two would bypass those safeguards.
- **Field-by-field assignment in `updateLanguage`.** A blanket object spread would overwrite unset fields with `undefined`; each field is individually checked (`!== undefined`) before assignment.
- **Duplicate-tag check in `createLanguage` is advisory.** A concurrent request can still reach the MongoDB unique index (`E11000`), which the shared error interpreter maps to 409.
- **Optional `context` parameter.** When omitted (e.g. in unit tests that call the service as a plain helper), `recordAudit` is skipped entirely.
- **`rejectUnknownApp` is intentionally exported** so sibling service files (`entries.ts`, `messages.ts`, etc.) can enforce the same rule on their own write paths without re-implementing it.
- **Cache + overlay refresh happen on every mutation**, not only on activate/deactivate/delete. An edit to a display name must reach the current worker's served-language list immediately, not wait for a TTL.
