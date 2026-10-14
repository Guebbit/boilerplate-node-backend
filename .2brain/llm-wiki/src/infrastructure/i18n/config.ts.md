---
source: src/infrastructure/i18n/config.ts
sha256: f96cef68972328392fddfb8bd73aeb4fb3befd2b78f9751ea67bc2aeeec6395e
generated_at: 2026-10-14T08:03:02.442654+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/i18n/config.ts

## Purpose

Declares the locale-related settings for the deployment: which language is default, which is the fallback, the list of supported languages, and the refresh interval for edited-copy overrides. It uses the project's typed `defineConfig` pattern so that all locale knobs live in one place with defaults and validation.

## Key elements

- **`localeConfig`** – The single exported configuration object (name: `'locales'`). Contains four validated fields:
  - `NODE_DEFAULT_LOCALE` – `text`, default `'en'`. The locale used for new content.
  - `NODE_FALLBACK_LOCALE` – `text`, default `'en'`. Locale to fall back to when a translation is missing.
  - `NODE_SUPPORTED_LOCALES` – `csv` (comma-separated list). The full set of languages the deployment offers.
  - `NODE_LOCALE_OVERRIDE_REFRESH_MS` – `int`, default `60_000`, min `1`. How often the edited-copy overlay is re-fetched.

## Relationships

- **`src/infrastructure/config/define.ts`** – Provides `defineConfig`, the builder this file uses to declare the shape and defaults.
- **`src/infrastructure/config/fields.ts`** – Provides the `text`, `csv`, and `int` field-constructor functions used in the shape definition.
- **`src/infrastructure/i18n/catalog.ts`** – Sibling in the i18n domain; consumes `localeConfig` to know which locales to load translations for.
- **`src/infrastructure/i18n/overrides.ts`** – Sibling in the i18n domain; reads `NODE_LOCALE_OVERRIDE_REFRESH_MS` to drive its polling interval.
- **`src/app/config.ts`** – Top-level app configuration aggregator that pulls in `localeConfig` alongside other domain configs.
- **`src/modules/users/model.ts`** – User model may reference the supported-locale list to validate or default a user's preferred language.

## Notes

- All field names are prefixed `NODE_` to signal they map to environment variables in the `NODE_` namespace (e.g. `NODE_DEFAULT_LOCALE`).
- `NODE_SUPPORTED_LOCALES` uses the `csv` field type rather than an array, meaning the env value is a single comma-delimited string (`"en,fr,de"`) parsed by the field helper.
- Defaults for both default and fallback locale are `'en'`; a deployment must explicitly set them (or the supported list) to offer non-English locales.
- The module doc-comment links to `docs/tools/configuration.md` for operator-facing documentation of these settings.
