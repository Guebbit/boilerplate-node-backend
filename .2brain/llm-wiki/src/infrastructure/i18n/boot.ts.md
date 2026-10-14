---
source: src/infrastructure/i18n/boot.ts
sha256: d958da445d559ae8f339b129222207921d6cdb8ec34c7d15796cdd84f53a1a53
generated_at: 2026-10-14T08:02:14.849219+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/i18n/boot.ts

## Purpose

Initialises the single global `i18next` instance shared by every entry point in the project. It accepts a pre-resolved list of locale directories and a target language, then wires up `lng`, `fallbackLng`, `supportedLngs`, and in-memory resources so that no backend adapter is needed.

## Key elements

- **`bootI18n(localeDirectories: string[], lng?: string): Promise<TFunction>`** — the sole export. Registers the supplied directories in the catalog, then calls `i18next.init` with the active locale, fallback, supported list, loaded resources, and `interpolation.escapeValue: false`. Returns the initialised `TFunction`.
- `lng` defaults to `getDefaultLocale()`; callers that need a pinned language (e.g. jest's global setup) pass it explicitly.
- Relies entirely on `./catalog` helpers (`registerLocaleDirectories`, `loadLocaleResources`, `listSupportedLocales`, `getDefaultLocale`, `getFallbackLocale`) for locale metadata and resource loading.

## Relationships

- **`src/infrastructure/i18n/catalog.ts`** — provides every locale-catalog function this file imports; `bootI18n` delegates all directory registration and resource loading to it.
- **`src/infrastructure/i18n/index.ts`** — barrel re-export; consumers that import the i18n package pull `bootI18n` through this.
- **`src/app.ts`** — production HTTP entry point; calls `bootI18n` during real server boot.
- **`scripts/ops/reap-inactive-accounts.ts`**, **`scripts/ops/sweep-preorders.ts`**, **`scripts/ops/sweep-reservations.ts`** — standalone ops scripts that need `t()` outside the HTTP process; each resolves its own locale directories (e.g. a disk glob) and then calls `bootI18n`.
- **`tests/support/setup.ts`** — jest global setup; calls `bootI18n` with a mock-safe directory list and pins `lng` to `en`.

## Notes

- Must be awaited before any code calls `t()` or installs Zod validation messages (`registerValidationMessages`), or translations will silently fall back.
- `interpolation.escapeValue` is set to `false` deliberately: escaping happens once at the HTML sink, so plain-text contexts (e.g. email subjects) are not double-escaped.
- Callers own *how* they discover locale directories (module registry, glob, mock read); this file only accepts the final absolute-path array.
- See `docs/tools/i18n.md` for the broader i18n workflow.
