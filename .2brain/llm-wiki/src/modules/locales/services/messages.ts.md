---
source: src/modules/locales/services/messages.ts
sha256: 99a21dd817e5971c484e1c704a9cf7bca6862cd55e683155bf1d6f7fe136c819
generated_at: 2026-09-27T15:01:36.588425+00:00
model: ollama:qwen3.8:27b
---

# src/modules/locales/services/messages.ts

## Purpose

Provides the two read paths that hand out stored locale copy: `readMessages` serves a frontend tenant's downloadable overrides for one language, and `readApiOverrides` returns the backend tenant's full override set grouped by language. Both expand flat key/value rows into nested trees via `buildMessageTree`; they differ in which tenant's keyspace they serve and how they treat inactive languages.

## Key elements

- **`readMessages(tag, tenant?)`** — Returns a client-ready `LocaleMessages` object (tag, revision, tree) for one frontend tenant and one language. Rejects non-frontend tenants, unknown tags, and inactive languages with a `languageNotFound` (404) response. Defaults `tenant` to the deployment's `frontendTenant()`.
- **`readApiOverrides()`** — Returns a `Record<locale, tree>` of all backend-tenant entries, including inactive languages. Groups rows by locale, builds a tree per locale inside a `try/catch` so one malformed locale logs a warning and is skipped rather than aborting the whole refresh.

## Relationships

- **`../repository`** — Calls `localeRepository.findByTag` (look up language metadata) and `localeEntryRepository.listEntries` / `listEntriesByTenant` (fetch flat key/value rows).
- **`./keys`** — Calls `buildMessageTree` to expand flat `{ key, value }` arrays into the nested object shape both exports return.
- **`./languages`** — Imports `languageNotFound` as the standard 404 response for missing/inactive languages.
- **`../tenants`** — Uses `frontendTenant()`, `backendTenant()`, and `isFrontendTenant()` to determine which keyspace each function serves and to guard the tenant parameter.
- **`@infrastructure/http/response`** — Uses `generateSuccess` to wrap successful payloads and the `ResponseSuccess` / `ResponseReject` types for the return signature.
- **`@infrastructure/adapters/logger`** — Emits a `warn` in the per-locale catch block of `readApiOverrides`.
- **`@types`** — Imports `LocaleMessages` and `LocaleTenant` for type annotations.

## Notes

- Inactive languages are **excluded** from `readMessages` (404) but **included** in `readApiOverrides`. This is intentional: `active` governs public visibility only; the backend overlay must keep serving draft copy so translations can be updated without a mid-flight revert.
- `readMessages` returns a 404 (not 403) for non-frontend tenants and for inactive languages to avoid leaking that a draft translation exists.
- The `try/catch` around `buildMessageTree` in `readApiOverrides` is scoped per-locale with an explicit `// eslint-disable-next-line no-restricted-syntax` and Stryker mutation-testing disable/restore guards — one bad dictionary must not sink the rest.
- `readApiOverrides` has no HTTP response wrapper; it returns a plain `Record` because the i18n provider (not an HTTP handler) is the caller.
