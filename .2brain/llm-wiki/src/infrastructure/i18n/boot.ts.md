---
source: src/infrastructure/i18n/boot.ts
sha256: e82f3ada9ebcdafe4a2c1893b64d28458c665dad6d70572b83eda134508c7d36
generated_at: 2026-11-08T03:35:49.113303+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/i18n/boot.ts

## Purpose

Single entry point that initializes the one global **i18next** instance shared across the entire application. It separates the *how-to-find-locale-dirs* concern (left to each caller) from the *how-to-boot-i18next* concern (owned here), so that `app.ts`, ops scripts, and the Jest suite all end up with a consistent, fully-loaded translator.

## Key elements

- **`bootI18n(localeDirectories, lng?)`** — the sole export. Registers the supplied directory list in the locale catalog, then calls `i18next.init` with:
  - `lng` / `fallbackLng` / `supportedLngs` — locale policy sourced from `./catalog`.
  - `resources` — in-memory dictionaries (no i18next backend plugin).
  - `interpolation.escapeValue: false` — escaping is deferred to the HTML rendering sink to avoid double-escaping names and to keep plain-text email subjects unescaped.
  - Returns the initialized `TFunction`.
- **`@module` directive** — no default export; consumers import the named `bootI18n`.

## Relationships

- **`src/infrastructure/i18n/catalog.ts`** — sole runtime import. Provides `registerLocaleDirectories`, `getDefaultLocale`, `getFallbackLocale`, `listSupportedLocales`, and `loadLocaleResources`. All locale-policy decisions live in the catalog; this file only orchestrates the init call.
- **`src/app.ts`** — production caller. Resolves locale directories via the module registry, then calls `bootI18n` during server boot (before any route handler or Zod `registerValidationMessages` runs).
- **`scripts/ops/prepare-job.ts`** — ops-script caller. Resolves locale directories from a disk glob outside the HTTP process and calls `bootI18n` to render email copy with the same dictionaries.
- **`tests/support/setup.ts`** — Jest global setup. Calls `bootI18n` pinned to `en` so every suite starts with a deterministic, English-only translator.
- **`src/infrastructure/i18n/index.ts`** — package barrel that re-exports this module alongside the catalog, making `bootI18n` available to consumers of the `i18n` package.

## Notes

- **Ordering constraint:** `bootI18n` must complete before anything calls `t()`, and in particular before `registerValidationMessages()` installs Zod's error map. Calling `t()` earlier will throw or return keys.
- **Caller owns resolution:** This file never touches the filesystem or the module registry. Each entry point decides *how* it finds locale directories (registry, glob, or a pre-framework mock read) and passes plain absolute paths.
- **No backend plugin:** Dictionaries are loaded in-memory via `loadLocaleResources()`; there is no i18next-backend or HTTP resource fetch at runtime.
- **Default `lng`:** When omitted, `getDefaultLocale()` (from the catalog) is used — the value production and ops scripts expect. Only the Jest setup overrides it.
