---
source: src/modules/locales/services/messages.ts
sha256: 642e8de8acdbb9b09258cae9f7e07e78d3e3585864142a2964c96a994bc04903
generated_at: 2026-11-08T06:26:21.035449+00:00
model: ollama:qwen3.8:27b
---

# src/modules/locales/services/messages.ts

## Purpose

Provides the two read paths for stored locale copy: `readMessages` serves a single frontend app's per-language entries to a client, and `readApiOverrides` builds the backend's own override tree. A third function, `readLocaleOverlay`, bundles both plus the active/inactive tag lists so the i18n provider refreshes copy and served-language state atomically.

## Key elements

- **`readMessages(tag, app?, includeInactive?)`** — Looks up a language row and its entries for the given frontend app, returns `{ locale, revision, messages }` via `generateSuccess`, or a 404 (`languageNotFound`) for unknown apps, missing languages, and inactive languages (unless `includeInactive` is set). `app` defaults to `frontendApp()`.
- **`readApiOverrides()`** — Fetches all backend-app rows, groups them by locale, and expands each group into a message tree with `buildMessageTree`. Per-locale `try/catch` logs a warning and skips a locale whose keys cannot form a tree. Inactive languages are **included** deliberately.
- **`readLocaleOverlay()`** — Runs `readApiOverrides`, `localeRepository.listActiveTags()`, and `localeRepository.listInactiveTags()` concurrently; resolves to a single `LocaleOverlay` object. Keeps the last good set of both in place on failure (caller-side, per the i18n provider).

## Relationships

- **`../repository`** (`repository.ts`) — `localeRepository` (language row lookups, active/inactive tag lists) and `localeEntryRepository` (entry rows per app/locale).
- **`../apps`** (`apps.ts`) — `frontendApp()`, `backendApp()`, `isFrontendApp()` determine which keyspace each read is scoped to.
- **`./keys`** (`keys.ts`) — `buildMessageTree` expands flat `{key, value}` rows into a nested object for both exports.
- **`./languages`** (`languages.ts`) — `languageNotFound` supplies the 404 response in `readMessages`.
- **`@infrastructure/i18n`** (`index.ts`) — `LocaleOverlay` type shapes the return of `readLocaleOverlay`; the i18n provider is the caller that rebuilds its overlay from this.
- **`@infrastructure/http/response`** (`response.ts`) — `generateSuccess`, `ResponseSuccess`, `ResponseReject` define the HTTP-shaped return of `readMessages`.
- **`@infrastructure/adapters/logger`** (`logger.ts`) — `logger.warn` in the per-locale catch of `readApiOverrides`.
- **`@types`** (`types/index.ts`) — `LocaleMessages`, `LocaleApp` shared type imports.
- **`services/index.ts`** — barrel re-export for this module.

## Notes

- **Inactive-language asymmetry:** `readMessages` returns 404 for inactive languages (prevents leaking draft existence to public clients) unless the caller passes `includeInactive = true`. `readApiOverrides` intentionally **includes** inactive languages so a backend translation-in-progress isn't silently reverted mid-refresh.
- **Per-locale isolation in `readApiOverrides`:** a key that is simultaneously a string leaf and a group throws inside `buildMessageTree`; the `try/catch` is scoped per locale so one malformed dictionary degrades to a `logger.warn` without affecting other languages.
- **Mutation-testing guard:** the `Stryker disable all` / `Stryker restore all` comments around the `logger.warn` call tell Stryker not to mutate that block (it is a deliberate no-op recovery path).
- **`readLocaleOverlay` atomicity:** all three reads run in `Promise.all`; the i18n provider treats a rejected promise as "keep last good overlay" so copy and the served-language list never update independently.
