---
source: src/modules/locales/services/capabilities.ts
sha256: 58957b8a529d633801b2cc1bb44abc9af4ce3305ea9339961b3b50cdc44fff57
generated_at: 2026-10-29T04:23:06.103281+00:00
model: ollama:qwen3.8:27b
---

# src/modules/locales/services/capabilities.ts

## Purpose

The manifest service for the locales module. It assembles the single `Language[]` list that `GET /locales` and `GET /locales/{tag}` return, by merging two tiers — languages deployed as ICU files (static) and languages registered as database rows (dynamic) — into one representation that also carries per-caller visibility (`scope`) and available actions (`standing`).

## Key elements

- **`RIGHT_TO_LEFT_BASE_LANGUAGES`** — hardcoded `Set` of RTL base-language codes (13 entries). Chosen over `Intl.Locale#getTextInfo` for deployment portability.
- **`isRightToLeft(tag)`** — returns whether a tag's base language is RTL.
- **`describeLanguage(tag, inLanguage)`** — resolves a language's display name via `Intl.DisplayNames`; falls back to the raw tag on any error.
- **`staticCapability(tag, active?)`** — builds a `Language` object for a file-deployed language. Always `apps: [backendApp]`, `actions: NO_ACTIONS`, `source: 'static'`.
- **`dynamicCapability(language, entryCount, standing?)`** — builds a `Language` object from a `LocaleDocument` row. Always `apps: [frontendApp]`, `source: 'dynamic'`. Spreads `id`, `createdAt`, `updatedAt` only when present.
- **`mergeCapabilities(staticTags, dynamicLanguages, entryCounts, inactiveTags?, standing?)`** — the core merge. A tag present in both tiers yields one row with `apps: [backendApp, frontendApp]` and `source: 'both'`, using the dynamic row's display fields. Returns a `toSorted` (non-mutating) array ordered by tag.
- **`readDynamicTier(scope?)`** — parallel-reads `localeRepository.list`, `localeEntryRepository.countEntriesByLocale`, and `localeRepository.listInactiveTags`. Catches all failures: logs a `warn` and returns empty collections so the static tier is always served.
- **`callerScope(caller?)`** — delegates to `accessibleFilterFor(caller, 'Locale')` to produce the query filter for a given caller.
- **`readStanding(caller?)`** — delegates to `standingOnRead(callerScope, caller)` to determine which actions the caller may see.
- **`listCapabilities(scope?, standing?)`** — top-level entry point. Calls `readDynamicTier`, then `mergeCapabilities` with `listSupportedLocales()`, and returns `{ locales, default, fallback }`.
- **`readLanguage(tag, scope?, standing?)`** — single-language lookup through `listCapabilities`; returns `generateSuccess(language)` or `languageNotFound()` (404).
- **`describeStoredLanguage(document, standing)`** — builds the single-row manifest representation for a write response (create/update/delete), always including entry counts.

## Relationships

- **`src/infrastructure/i18n/catalog.ts`** (via `@infrastructure/i18n`) — source of `getDefaultLocale`, `getFallbackLocale`, `listSupportedLocales`.
- **`src/infrastructure/http/response.ts`** — `generateSuccess` wraps the 200 response; `ResponseReject` / `ResponseSuccess` type the return of `readLanguage`.
- **`src/infrastructure/adapters/logger.ts`** — `logger.warn` records the dynamic-tier fallback.
- **`src/kernel/access/query.ts`** — `accessibleFilterFor` builds the per-caller row filter.
- **`src/modules/locales/model.ts`** — `deriveBaseLanguage` and the `LocaleDocument` shape.
- **`src/modules/locales/repository.ts`** — `localeRepository` (list, inactive tags) and `localeEntryRepository` (entry counts).
- **`src/modules/locales/apps.ts`** — `backendApp()` and `frontendApp()` factory calls.
- **`src/modules/locales/services/actions.ts`** — `NO_ACTIONS`, `NO_STANDING`, `languageActions`, `standingOnRead`, `LanguageStanding` type.
- **`src/modules/locales/services/languages.ts`** — `languageNotFound` 404 response.
- **`src/types/index.ts`** (via `@types`) — `Language`, `LocaleCapabilities`, `LocaleDirection`, `LocaleSource`, `Caller`.
- **`src/modules/locales/services/index.ts`** — barrel re-export of this module.
- **`src/modules/locales/tests/unit/service.test.ts`** — unit tests for the service functions above.

## Notes

- **Graceful degradation is intentional.** `readDynamicTier` catches *all* errors and returns empty arrays/maps/sets. A database outage costs only the dynamic tier; static languages are always served. The failure is logged at `warn`, not swallowed silently.
- **`_id` vs `id`.** `dynamicCapability` reads `language._id` (the raw Mongoose lean document) and converts to a string `id`. It does not expect a pre-transformed `id` field.
- **`active` on a static language is informational, not functional.** A deployed file has no server-side off-switch. `active: false` signals a client that *bundles* the language to stop offering it; the file itself still exists on disk.
- **The `active` filter is caller-scoped, not global.** The admin who toggles the flag still sees every row (`localeRepository.list(scope)` receives the caller's scope). Visitors only see active rows. Inactive static tags are passed via `inactiveTags` so the merged row carries `active: false` rather than disappearing.
- **`toSorted` is used, not `sort`.** The sort in `mergeCapabilities` is non-mutating; inputs are `readonly` arrays.
- **`describeStoredLanguage` always includes entry counts** by issuing a fresh `countEntriesByLocale()` call, even for a single row, so the write-response representation matches the list.
