---
source: src/modules/locales/services/messages.ts
sha256: 8814d068e58d6acab14c67bc13da2e67d3131ba1c35ebf0dbbce9995cb6b958d
generated_at: 2026-10-15T10:46:23.414129+00:00
model: ollama:qwen3.8:27b
---

# src/modules/locales/services/messages.ts

## Purpose

Two read functions that expand flat locale rows into message trees via `buildMessageTree`: one serves a single frontend app's downloadable overrides to clients, the other serves the backend app's full overlay (grouped by language) to the API's own i18n provider. They differ only in which app's keyspace they read and how they handle inactive languages.

## Key elements

- **`readMessages(tag, app?)`** — Looks up a language by tag, verifies it is active, then lists entries for the given (or default) frontend app and returns `{ locale, revision, messages }` wrapped in `generateSuccess`. Returns a 404 (`languageNotFound()`) if the app is a backend app, the language is missing, or the language is inactive.
- **`readApiOverrides()`** — Lists **all** backend-app rows, groups them by locale, and calls `buildMessageTree` per locale. Deliberately includes inactive languages. Catches per-locale build errors and logs a warning instead of throwing, so one malformed dictionary does not abort the whole refresh. Returns a plain `Record<string, Record<string, unknown>>`.

## Relationships

- **`./keys.ts`** — Both functions call `buildMessageTree` to turn flat `{ key, value }` rows into a nested object.
- **`./languages.ts`** — `readMessages` calls `languageNotFound()` for every failure path (unknown tag, inactive, wrong app).
- **`../apps.ts`** — Provides `frontendApp()` (default param), `backendApp()` (used by `readApiOverrides`), and `isFrontendApp()` (guard in `readMessages`).
- **`../repository.ts`** — `localeRepository.findByTag` fetches the language row; `localeEntryRepository.listEntries` / `listEntriesByApp` fetch the flat key–value rows.
- **`@infrastructure/http/response`** — `generateSuccess` wraps the 200 body in `readMessages`; the `ResponseSuccess` / `ResponseReject` types shape the return type.
- **`@infrastructure/adapters/logger`** — `logger.warn` in `readApiOverrides`'s catch block when a locale's keys cannot form a tree.
- **`@types`** — `LocaleMessages` and `LocaleApp` types imported for signatures.
- **`./index.ts`** — Re-exports this module so callers import from the services barrel.

## Notes

- **Inactive-language policy differs per function.** `readMessages` 404s inactive languages (avoids leaking that a draft exists). `readApiOverrides` *includes* them on purpose — `active` gates public visibility, not internal copy, and excluding them would silently revert backend strings mid-translation.
- **Per-locale error isolation in `readApiOverrides`.** A key that is simultaneously a string leaf and a group node causes `buildMessageTree` to throw; the `try/catch` is scoped per locale so remaining locales still load.
- **Stryker suppression.** The catch block is wrapped in `// Stryker disable all` / `// Stryker restore all` to prevent mutation testing from flagging the dead-path warning.
- **`eslint-disable-next-line no-restricted-syntax`** is used on the `for…of` loops in `readApiOverrides` because the project otherwise bans `for…of`; the override is intentional there.
