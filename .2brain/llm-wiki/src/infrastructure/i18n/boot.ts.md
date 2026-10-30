---
source: src/infrastructure/i18n/boot.ts
sha256: e82f3ada9ebcdafe4a2c1893b64d28458c665dad6d70572b83eda134508c7d36
generated_at: 2026-10-29T02:06:17.297831+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/i18n/boot.ts

## Purpose

Provides the single shared entry point (`bootI18n`) that initialises the one global i18next instance used by every process in the codebase. It separates *how* locale directories are discovered (left to each caller) from *how* i18next is configured, so the HTTP server, ops scripts, and the test suite all boot identical i18next settings.

## Key elements

- **`bootI18n(localeDirectories: string[], lng?: string): Promise<TFunction>`** — The sole export. Calls `registerLocaleDirectories` with the resolved paths, then `i18next.init` with `lng`, `fallbackLng`, `supportedLngs`, in-memory `resources`, and `interpolation.escapeValue: false`. Defaults `lng` to `getDefaultLocale()`; a caller may pin a specific language (e.g. `en` in tests).

## Relationships

- **`src/infrastructure/i18n/catalog.ts`** — Supplies all five catalog functions (`getDefaultLocale`, `getFallbackLocale`, `listSupportedLocales`, `loadLocaleResources`, `registerLocaleDirectories`) that `bootI18n` calls to assemble the i18next configuration.
- **`src/infrastructure/i18n/index.ts`** — Barrel module; re-exports `bootI18n` (and catalog helpers) for consumers.
- **`src/app.ts`** — Production HTTP boot; calls `bootI18n` with module-registry-resolved directories before any route handler runs.
- **`scripts/ops/run-job.ts`** — Non-HTTP ops entry point; calls `bootI18n` with a disk-globbed directory list to render email copy.
- **`tests/support/setup.ts`** — Jest global setup; calls `bootI18n` with a mock-safe read and pins `lng` to `en`.

## Notes

- **Ordering contract:** `bootI18n` must complete before any code calls `t()`. In particular, `registerValidationMessages()` (which wires Zod's error map through `t()`) depends on i18next being initialised first.
- **`interpolation.escapeValue: false`** is intentional: HTML escaping happens once at the render sink, preventing double-escaping of names and keeping plain-text email subjects un-escaped.
- Callers are responsible for resolving and passing *absolute* paths to directories that each contain `<locale>.json` files; this file performs no filesystem discovery itself.
