---
source: src/infrastructure/i18n/boot.ts
source_sha256: e7696e70dfbd049342375a2097b044c040574c4a270a2cafddfbaadbc433e0a5
context_sha256: 1fcced50b662c1c64b34e186efd18af96fdd1736a33a70e05c267b922149b944
generated_at: 2026-11-22T02:55:03.206671+00:00
model: claude-code:claude-sonnet-5-5
---

# src/infrastructure/i18n/boot.ts

## Purpose
Brings up the single global i18next instance shared by every entry point: the real app boot, ops scripts that render email copy outside the HTTP process, and jest's global setup. Each caller decides how it locates its locale directories and passes the resolved list in. This file only registers them and initializes i18next.

## Key elements
- `bootI18n(localeDirectories, lng = getDefaultLocale())`: the only export. It does two things:
  - Registers the directories via `registerLocaleDirectories`.
  - Calls `i18next.init` and returns its `Promise<TFunction>`.
- The `init` options are:
  - `lng`: the active language.
  - `fallbackLng`: from `getFallbackLocale()`.
  - `supportedLngs`: from `listSupportedLocales()`.
  - `resources`: from `loadLocaleResources()`, so dictionaries are in memory and there is no backend.
  - `interpolation.escapeValue: false`.

## Relationships
- `./catalog` supplies every helper used here: `registerLocaleDirectories`, `getDefaultLocale`, `getFallbackLocale`, `listSupportedLocales` and `loadLocaleResources`. `catalog` holds the locale state, and this file only wires it into i18next.
- The doc comment describes three kinds of callers: the app's real boot, an ops script rendering email copy outside the HTTP process, and jest's global setup. Of the graph neighbors, `tests/support/setup.ts` is the jest setup (which passes `en` explicitly). `scripts/ops/reapply-erasures.ts` and `src/app/boot-rendering.ts` are related through the dependency graph, but the file content does not show how they use it.
- `src/infrastructure/i18n/index.ts` is a graph neighbor. The content does not show whether it re-exports `bootI18n`.

## Notes
- It must run before anything calls `t()`. The comment singles out `registerValidationMessages()`, which installs Zod's error map through `t()`.
- `escapeValue: false` is deliberate. Values are escaped once, at the sink (the HTML template), so names are not double-escaped and plain-text subjects stay plain.
- `lng` defaults to the catalog's default locale. Production boot and the ops script rely on that default, while jest's setup pins `en`.
- `supportedLngs` makes i18next reject any language tag outside the supported list.
