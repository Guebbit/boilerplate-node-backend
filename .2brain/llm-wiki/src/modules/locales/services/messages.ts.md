---
source: src/modules/locales/services/messages.ts
sha256: 642e8de8acdbb9b09258cae9f7e07e78d3e3585864142a2964c96a994bc04903
generated_at: 2026-10-29T04:24:22.033718+00:00
model: ollama:qwen3.8:27b
---

# src/modules/locales/services/messages.ts

## Purpose

Provides the two read paths for stored locale copy: `readMessages` serves a frontend app's downloadable overrides to a client, and `readApiOverrides` rebuilds the API's own backend overlay. Both expand flat `key/value` rows through `buildMessageTree` but differ in which app's keyspace they serve. A third entry point, `readLocaleOverlay`, bundles the backend overrides with the active/inactive language lists into a single atomic refresh for the i18n provider.

## Key elements

- **`readMessages(tag, app?, includeInactive?)`** — Looks up one language and returns its frontend-app entries as `{ locale, revision, messages }`. Returns `languageNotFound()` (404) for unknown tags, inactive languages, or non-frontend apps. The `includeInactive` flag lets staff callers preview drafts.
- **`readApiOverrides()`** — Lists all backend-app entries, groups them by locale, and builds a `Record<locale, tree>`. Includes inactive languages by design. Wraps each locale's `buildMessageTree` in a try/catch so one malformed dictionary is logged (via `logger.warn`) and skipped without aborting the rest.
- **`readLocaleOverlay()`** — `Promise.all` over `readApiOverrides`, `localeRepository.listActiveTags`, and `localeRepository.listInactiveTags`; returns the combined `LocaleOverlay` object. Ensures copy and the served-language list come from the same refresh.

## Relationships

- **`src/modules/locales/services/keys.ts`** — Calls `buildMessageTree` in both read functions to flatten rows into nested objects.
- **`src/modules/locales/services/languages.ts`** — Imports `languageNotFound` as the 404 response factory.
- **`src/modules/locales/apps.ts`** — Imports `frontendApp`, `backendApp`, and `isFrontendApp` to determine which keyspace a read targets.
- **`src/modules/locales/repository.ts`** — Uses `localeRepository.findByTag`, `localeRepository.listActiveTags`, `localeRepository.listInactiveTags`, `localeEntryRepository.listEntries`, and `localeEntryRepository.listEntriesByApp` for all data access.
- **`src/infrastructure/i18n/index.ts`** — Imports the `LocaleOverlay` type (the return shape of `readLocaleOverlay`); that module is the consumer.
- **`src/infrastructure/http/response.ts`** — Imports `generateSuccess` and the `ResponseSuccess` / `ResponseReject` types to shape `readMessages` output.
- **`src/infrastructure/adapters/logger.ts`** — Calls `logger.warn` in the per-locale catch block of `readApiOverrides`.
- **`src/types/index.ts`** — Imports `LocaleMessages` and `LocaleApp` types.
- **`src/modules/locales/services/index.ts`** — Barrel file; re-exports the three functions above for module consumers.

## Notes

- Inactive languages are treated as 404 (not 403 or empty 200) in `readMessages` to avoid leaking that a draft translation exists.
- `readApiOverrides` deliberately includes inactive languages: `active` governs public visibility, but the backend should not silently revert its own copy mid-translation.
- The `for…of` loop in `readApiOverrides` carries an `eslint-disable-next-line no-restricted-syntax` comment; the try/catch is intentional and scoped per locale.
- Stryker mutation-testing annotations (`Stryker disable all` / `restore all`) wrap the logger call in the catch block to suppress mutation noise on defensive logging.
