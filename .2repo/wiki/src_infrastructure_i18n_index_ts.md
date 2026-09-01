# src/infrastructure/i18n/index.ts

## Purpose

Barrel module for the request-scoped i18n subsystem. It re-exports the four sub-modules (`catalog`, `overrides`, `context`, `negotiate`) under a single import path so that every call site uses `@infrastructure/i18n` instead of reaching into i18next's global instance directly. This keeps the per-request translation context (see `./context`) on the hot path and avoids the one-global-instance-with-one-active-language model that i18next's default export exposes.

## Key elements

- **`t`, `translator`** (from `./context`) — the per-request translation function; the primary symbol consumers import.
- **`createLocaleContext`, `getLocaleContext`, `runWithLocale`, `runWithLocaleContext`** (from `./context`) — helpers for binding a `LocaleContext` to the current async execution scope.
- **`getDefaultLocale`, `getFallbackLocale`, `listSupportedLocales`, `loadLocaleResources`, `readLocaleDictionary`, `registerLocaleDirectories`, `resetSupportedLocales`** (from `./catalog`) — static locale-dictionary loading and registry.
- **`applyLocaleOverrides`, `refreshLocaleOverrides`, `registerLocaleOverrideProvider`, `startLocaleOverrideRefresh`, `stopLocaleOverrideRefresh`, `getOverrideRefreshMs`, `resetLocaleOverrides`, `LocaleOverrideProvider`** (from `./overrides`) — admin-editable translation overlay with optional periodic refresh.
- **`negotiateLocale`** (from `./negotiate`) — matches an `Accept-Language` header against the supported-locale list.

## Relationships

- **`./catalog`, `./context`, `./negotiate`, `./overrides`** — the four files this barrel re-exports from; they contain the actual logic and this file adds no behavior of its own.
- **`src/infrastructure/http/middlewares/locale.ts`** — likely the middleware that calls `negotiateLocale` and then `createLocaleContext` / `runWithLocale` to bind the chosen locale per request.
- **`src/app.ts`, `src/app/error-handling.ts`, `src/infrastructure/surfaces/*`, `src/kernel/middlewares/authorizations.ts`, `src/infrastructure/http/validation-messages.ts`** — consumer call sites that import `t` (and possibly `negotiateLocale`) through this barrel to produce localized strings.
- **`src/infrastructure/runtime/server-lifecycle.ts`** — likely responsible for calling `startLocaleOverrideRefresh` / `stopLocaleOverrideRefresh` and `registerLocaleDirectories` during startup/shutdown.

## Notes

- The JSDoc explicitly forbids importing `t` from `'i18next'` directly; always go through this barrel so the per-request context is used.
- All ~70 import sites reference the path alias `@infrastructure/i18n` rather than a relative path — use the alias when adding new call sites.
- `resetSupportedLocales` and `resetLocaleOverrides` exist for test isolation; they are not expected in production code paths.
- For deeper design context see `docs/tools/i18n.md` (referenced in the module doc-comment).
