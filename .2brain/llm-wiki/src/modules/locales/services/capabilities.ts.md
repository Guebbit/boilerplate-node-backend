---
source: src/modules/locales/services/capabilities.ts
source_sha256: f8ba668f5a00fd1a77c3ca6848d73440bc51abf215d427ea03f8f7d6ffbb2ace
context_sha256: 5783799c7f1a8a2ce16cc8693579074b4783a92842f5869e10e6dbe08a5b09f3
generated_at: 2026-11-22T05:47:00.685937+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/locales/services/capabilities.ts

## Purpose
Builds the locale "manifest": which languages this deployment offers and what each can do. It merges two tiers, static languages (deployed dictionary files) and dynamic languages (rows registered in the database), into one sorted list without treating them as the same capability. It also provides the read and write-answer helpers that return this representation.

## Key elements
- `isRightToLeft(tag)`: checks the tag's base language against a hard-coded RTL set. Used only for static languages.
- `describeLanguage(tag, inLanguage)`: returns the language name via `Intl.DisplayNames`. Falls back to the tag itself on error.
- `staticCapability(tag, active)`: builds a `Language` for a file-only language. It has the backend app only, `source: static`, `entryCount: 0`, `revision: 0` and `NO_ACTIONS`.
- `dynamicCapability(language, entryCount, standing)`: builds a `Language` from a row. It has the frontend app only, `source: dynamic`, and actions from `languageActions`. `id` and timestamps are included only when present. The result is wrapped in `carryVersion`.
- `mergeCapabilities(staticTags, dynamicLanguages, entryCounts, inactiveTags, standing)`: merges the two tiers. A tag in both becomes one row with both apps, `source: both` and the dynamic display fields. The output is sorted by tag.
- `readDynamicTier(scope)`: loads rows, entry counts and inactive tags in parallel. On any failure it logs a warning and returns empty data, so the static half is still served.
- `callerScope(caller)`: returns `accessibleFilterFor(caller, 'Locale')`. Holders of `display:Locale` see every language. Everyone else sees only active ones.
- `readStanding(caller)`: returns `standingOnRead(callerScope, caller)`, the standing a manifest read may carry for this caller.
- `listCapabilities(scope, standing)`: returns `{ locales, default, fallback }`.
- `readLanguage(tag, scope, standing)`: finds one language in `listCapabilities` by canonical tag. Returns `generateSuccess` or `languageNotFound()`.
- `describeStoredLanguage(document, standing)`: builds the manifest row for a just-written document, for write responses.

## Relationships
- `src/modules/locales/repository.ts`: `localeRepository` (`list`, `listInactiveTags`) and `localeEntryRepository` (`countEntriesByLocale`) supply the dynamic tier.
- `src/modules/locales/model.ts`: provides the `LocaleDocument` type and `deriveBaseLanguage`.
- `src/modules/locales/apps.ts`: `backendApp()` and `frontendApp()` provide the app lists.
- `src/modules/locales/services/actions.ts`: provides `NO_ACTIONS`, `NO_STANDING`, `languageActions`, `standingOnRead` and the `LanguageStanding` type.
- `src/modules/locales/services/languages.ts`: provides `languageNotFound`.
- `src/infrastructure/i18n/index.ts` (with `catalog.ts` and `locale-tag.ts` in the same folder): provides `listSupportedLocales`, `getDefaultLocale`, `getFallbackLocale` and `canonicalLocale`.
- `src/infrastructure/http/response.ts`: provides `generateSuccess` and the response types.
- `src/infrastructure/persistence/versioning.ts`: `carryVersion` attaches the edit counter so an `ETag` can be derived.
- `src/kernel/access/query.ts`: `accessibleFilterFor` produces the read scope.
- `src/infrastructure/adapters/logger.ts`: records the warning when the dynamic tier is unavailable.
- `@types` (including `src/types/auth-context.ts`): provides `Language`, `LocaleCapabilities`, `Caller`, `LocaleDirection` and `LocaleSource`.
- `src/modules/locales/services/index.ts` and `src/modules/locales/tests/unit/service.test.ts` sit next to this file in the dependency graph. The visible code does not show how they use it.

## Notes
- A deployed file has no off switch of its own. A registered row for the same tag can switch it off. A visitor then still receives the row as `active: false`, so a client that bundles the language itself stops offering it.
- The inactive-tag flags come from an unscoped read, because a visitor's scoped read drops the inactive row.
- `readLanguage` goes through `listCapabilities` so the single-language read, write answers and list share one representation and one scoping.
- A database outage degrades to static-only output. It does not fail the request.
- `describeStoredLanguage` runs the document through `mergeCapabilities`, so a stored language whose tag also has a deployed file is returned as `source: both`.
