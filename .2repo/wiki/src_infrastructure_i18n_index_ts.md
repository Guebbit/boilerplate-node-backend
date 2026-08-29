# src/infrastructure/i18n/index.ts

## Purpose

Barrel (entry-point) export for the i18n infrastructure. It re-exports the public API of four submodules—`catalog`, `overrides`, `context`, `negotiate`—under a single import path (`@infrastructure/i18n`) so that ~70 import sites never need to know which file answers a given symbol. It also enforces the project convention that request-scoped translation is always obtained via this module, never from a global `i18next` instance.

## Key elements

- **From `./catalog`** — `getDefaultLocale`, `getFallbackLocale`, `listSupportedLocales`, `loadLocaleResources`, `readLocaleDictionary`, `registerLocaleDirectories`, `resetSupportedLocales`: locale discovery, per-module resource merge, and boot-time registration.
- **From `./overrides`** — `applyLocaleOverrides`, `getOverrideRefreshMs`, `refreshLocaleOverrides`, `registerLocaleOverrideProvider`, `resetLocaleOverrides`, `startLocaleOverrideRefresh`, `stopLocaleOverrideRefresh`, `LocaleOverrideProvider`: admin-editable database overlay with a timed refresh lifecycle.
- **From `./context`** — `createLocaleContext`, `getCurrentLocale`, `getLocaleContext`, `runWithLocale`, `runWithLocaleContext`, `t`, `translator`, `LocaleContext`: the `AsyncLocalStorage`-backed request scope and the ambient `t` function.
- **From `./negotiate`** — `negotiateLocale`: resolves an `Accept-Language` header to one supported locale.

## Relationships

- **`src/infrastructure/i18n/catalog.ts`, `overrides.ts`, `context.ts`, `negotiate.ts`** — this file's sole role is re-exporting their public symbols; it defines nothing itself. The only internal edge between submodules is `overrides` → `catalog`.
- **`src/infrastructure/http/middlewares/locale.ts`** — primary consumer: calls `negotiateLocale` and wraps the request in `runWithLocale` / `runWithLocaleContext` so downstream code sees the correct `t`.
- **`src/app.ts`, `src/app/error-handling.ts`** — import locale helpers (`getDefaultLocale`, `listSupportedLocales`, `t`) for boot-time setup and error-message formatting.
- **`src/infrastructure/runtime/server-lifecycle.ts`** — drives the override refresh loop via `startLocaleOverrideRefresh` / `stopLocaleOverrideRefresh`.
- **`src/infrastructure/http/validation-messages.ts`, `middlewares/security.ts`, `middlewares/authorizations.ts`, `delete-controller.ts`, `request.ts`, `modules/account/controllers/delete-account-confirm.ts`** — leaf consumers that call `t` (or `translator`) for user-facing strings.

## Notes

- **Never import `t` from `'i18next'` directly.** The library's default export is a single global instance with one active language; `./context` exists specifically to avoid that. This barrel is the sanctioned entry point.
- Import sites outside `src/infrastructure/i18n/` should use the barrel (`@infrastructure/i18n`), not a submodule path. Reaching for a submodule is reserved for code *inside* this directory (e.g., `overrides` importing `catalog`).
- See `docs/tools/i18n.md` for the broader design rationale.
