---
source: src/infrastructure/i18n/config.ts
source_sha256: 69962a9c214275144ce5ab6b4c0bce5873dede5863ceeca6793aabb318ecf4a1
context_sha256: 8400b94bdfb553cf86fb26dca5ebf6c3cde4e6bb0edf18319f0d539f0a68c8e8
generated_at: 2026-11-22T02:55:30.347542+00:00
model: claude-code:claude-sonnet-5-5
---

# src/infrastructure/i18n/config.ts

## Purpose
Declares the deployment's locale configuration: the default locale, the fallback locale, the set of supported languages, and how often the edited-copy overlay is refreshed. It exposes these as a single typed config object built from environment variables.

## Key elements
- `localeConfig` — result of `defineConfig` with the name `'locales'`. Its shape has four environment-backed fields:
  - `NODE_DEFAULT_LOCALE` — a `locale` field, default `'en'`.
  - `NODE_FALLBACK_LOCALE` — a `locale` field, default `'en'`.
  - `NODE_SUPPORTED_LOCALES` — a `locales()` field with no default declared here.
  - `NODE_LOCALE_OVERRIDE_REFRESH_MS` — an `int` field, default `MINUTE_MS` (one minute), minimum `1`.

## Relationships
- Uses `defineConfig` from `src/infrastructure/config/define.ts` to build the config.
- Uses the `int`, `locale` and `locales` field builders from `src/infrastructure/config/fields.ts`.
- Uses `MINUTE_MS` from `src/domain-primitives/time.ts` as the default refresh interval.
- The neighbors `src/app/config.ts`, `src/infrastructure/i18n/catalog.ts`, `src/infrastructure/i18n/overrides.ts` and `src/modules/users/model.ts` are linked in the dependency graph. This file does not import them, so any use of `localeConfig` is on their side.

## Notes
- The refresh interval is described as governing the "edited-copy overlay". That points to the overrides module, but this file only defines the value.
- The module header carries a `@see` reference to the "who-owns-what" section of a configuration doc under `docs/operate/`, concerning configuration ownership. That doc is not confirmed to exist in the repository.
