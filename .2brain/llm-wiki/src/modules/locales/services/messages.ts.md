---
source: src/modules/locales/services/messages.ts
source_sha256: 642e8de8acdbb9b09258cae9f7e07e78d3e3585864142a2964c96a994bc04903
context_sha256: 43152a9a1fd1955eeda8d7dfaf636e5fd1db97a47fbd765d4f66854e7b941daa
generated_at: 2026-11-22T05:48:17.012906+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/locales/services/messages.ts

## Purpose
Provides the two reads that serve stored translation copy: the overrides a frontend client downloads for one language, and the overrides the API itself overlays on its built-in i18n. Both turn flat repository rows into nested message trees via `buildMessageTree`. They differ in which app's keyspace they may serve: frontend apps only for clients, the backend app only for the API.

## Key elements
- **`readMessages(tag, app = frontendApp(), includeInactive = false)`**: returns `ResponseSuccess<LocaleMessages>` (`locale`, `revision`, `messages` tree) or a `ResponseReject`.
  - Returns `languageNotFound()` when `app` is not a frontend app (this covers the backend app and unconfigured ids), when the language is unknown, or when it is inactive and `includeInactive` is false.
  - The payload is overrides only, not a full dictionary. Clients merge it over their bundled copy key by key.
- **`readApiOverrides()`**: loads all backend-app entries with `listEntriesByApp(backendApp())`, groups them by locale, and builds a tree per locale. It includes inactive languages. A locale whose keys cannot form a tree is skipped, and a warning is logged.
- **`readLocaleOverlay()`**: runs `readApiOverrides()`, `listActiveTags()` and `listInactiveTags()` together and returns a `LocaleOverlay` of `{ overrides, activeTags, inactiveTags }`.

## Relationships
- **`../repository`**: `localeRepository` (`findByTag`, `listActiveTags`, `listInactiveTags`) and `localeEntryRepository` (`listEntries`, `listEntriesByApp`) supply the data.
- **`../apps`**: `frontendApp`, `backendApp` and `isFrontendApp` decide which app each read may serve.
- **`./keys`**: `buildMessageTree` expands flat rows into nested trees.
- **`./languages`**: `languageNotFound` supplies the shared 404 response.
- **`@infrastructure/http/response`**: `generateSuccess` and the `ResponseSuccess` / `ResponseReject` types.
- **`@infrastructure/i18n`**: the `LocaleOverlay` type. `readLocaleOverlay` is the read its provider calls on each refresh.
- **`@infrastructure/adapters/logger`**: used to log a warning when a language is skipped.
- **`@types`**: `LocaleMessages` and `LocaleApp`.

## Notes
- A 404 is returned for inactive languages so that a draft translation's existence is not leaked. The exception is `includeInactive`, which staff use to preview drafts (its value comes from `callerScope`).
- `readApiOverrides` includes inactive languages on purpose. `active` controls public visibility, not whether an override applies, so excluding them would revert backend copy mid-translation.
- The overlay's `readLocaleOverlay` fetches overrides and active/inactive tags together, so a failed read leaves the last good set of both in place.
- `buildMessageTree` throws when a key is both a string and a group. `readApiOverrides` catches this per locale, with an eslint-disable and Stryker-disable around the try/catch and the warning, so one malformed dictionary does not break the whole refresh.
- `readMessages` does not catch such errors.
