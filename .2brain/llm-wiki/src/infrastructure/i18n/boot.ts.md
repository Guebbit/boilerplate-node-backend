---
source: src/infrastructure/i18n/boot.ts
sha256: b2e1f20319b8fba0d34df8dfe289e5950c9fe307a1f4ac65a0d2e097ec7c0ced
generated_at: 2026-09-27T14:11:36.273275+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/i18n/boot.ts

## Purpose

Single entry point for initialising the one global `i18next` instance shared across every runtime (production server, ops scripts, test suites). It accepts an already-resolved list of locale directories and wires them into i18next alongside the catalog's locale metadata, so callers never duplicate boot logic.

## Key elements

- **`bootI18n(localeDirectories, lng?)`** (sole export) — Registers the supplied directories in the i18n catalog, then calls `i18next.init` with `lng` (defaults to `getDefaultLocale()`), `fallbackLng`, `supportedLngs`, and pre-loaded `resources`. Returns `Promise<TFunction>`.

## Relationships

- **`src/infrastructure/i18n/catalog.ts`** — Imports all five catalog helpers (`registerLocaleDirectories`, `getDefaultLocale`, `getFallbackLocale`, `listSupportedLocales`, `loadLocaleResources`). This file is its sole production dependency.
- **`src/infrastructure/i18n/index.ts`** — Barrel module; re-exports `bootI18n` so consumers import from `i18n` rather than `i18n/boot`.
- **`src/app.ts`** — Production boot path; calls `bootI18n` with directories discovered via the module registry before any handler or `t()` runs.
- **`scripts/ops/reap-inactive-accounts.ts`** — Ops script that calls `bootI18n` to render email copy outside the HTTP process, passing a disk-globbed directory list.
- **`tests/support/setup.ts`** — Jest global setup; calls `bootI18n` with a mock-safe directory read and an explicit `lng: 'en'` pin.

## Notes

- **Ordering contract:** must execute before any `t()` call, in particular before `registerValidationMessages()` installs Zod's error map. Running it late leaves Zod errors in the default language.
- **Caller responsibility:** resolving *where* locale files live (module registry, glob, fixture path) is the caller's job; this file only accepts absolute paths.
- **No side effects on import:** importing the module does nothing; the `i18next.init` call is deferred until `bootI18n` is actually invoked.
