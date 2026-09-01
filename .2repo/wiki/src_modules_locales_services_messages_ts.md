# src/modules/locales/services/messages.ts

## Purpose

Provides the two read paths that hand out stored locale copy: `readMessages` for a frontend client downloading a single language's overrides, and `readApiOverrides` for the API to rebuild its own i18n overlay. Both expand flat key-value rows into nested trees via `buildMessageTree`; they differ in which tenant's keyspace is served and how errors are surfaced.

## Key elements

- **`readMessages(tag, tenant?)`** — Resolves a language by tag, validates the tenant is a frontend one and the language is active, then returns `{ locale, revision, messages }` shaped as `ResponseSuccess<LocaleMessages>`. Returns `languageNotFound()` (404) for a backend-tenant id, an unknown tag, or an inactive language.
- **`readApiOverrides()`** — Fetches all rows for the backend tenant, groups them by locale, and builds a tree per locale. Returns a plain `Record<string, Record<string, unknown>>`. A locale whose keys cannot form a tree is skipped (logged, not thrown) so one malformed dictionary does not abort the whole refresh.

## Relationships

- **`../repository`** — Source of all data: `localeRepository.findByTag` and `localeMessageRepository.listEntries` / `listEntriesByTenant`.
- **`./keys`** — `buildMessageTree` converts flat `{key, value}` rows into the nested object both functions return.
- **`./languages`** — `languageNotFound` supplies the 404 response body used by `readMessages`.
- **`../tenants`** — `frontendTenant`, `backendTenant`, and `isFrontendTenant` drive tenant validation and default resolution.
- **`@infrastructure/http/response`** — `generateSuccess` and the `ResponseSuccess` / `ResponseReject` types shape the HTTP envelope.
- **`@infrastructure/adapters/logger`** — `logger.warn` records a skipped locale inside `readApiOverrides`.
- **`@types`** — Provides the `LocaleMessages` and `LocaleTenant` type contracts.
- **`./index.ts`** — Sibling service barrel; re-exports these functions to consumers of the locales service module.

## Notes

- **Inactive ≠ 403.** `readMessages` deliberately maps an inactive language to the same 404 as an unknown one so the response never reveals that a draft translation exists.
- **`readApiOverrides` *includes* inactive languages.** The `active` flag governs public visibility; excluding them here would silently revert backend copy while a translation is in progress.
- **Per-locale isolation.** The `try/catch` inside the `for…of` loop (with a scoped `eslint-disable no-restricted-syntax`) exists so that a single malformed key set (e.g. a key that is both a leaf and a group) degrades to a warning rather than a 500.
- **Client-side merge contract.** The returned tree is *not* a complete dictionary—clients merge it key-by-key over their bundled copy, so partially translated languages fall back per key.
