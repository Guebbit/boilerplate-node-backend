---
source: src/infrastructure/i18n/config.ts
sha256: 3ec5a277dce8aa75796526fa4a908f9461457110914426dee24841ee7e4ebe9f
generated_at: 2026-11-14T18:07:56.030235+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/i18n/config.ts

## Purpose

Declares the locale-related environment configuration (default locale, fallback locale, supported-locale list, and the refresh interval for edited-copy overrides) as a typed, validated config shape consumed by the rest of the i18n subsystem.

## Key elements

- **`localeConfig`** (exported const) — The single public export. A `defineConfig` object named `'locales'` whose `shape` maps four env-var keys to validated fields:
  - `NODE_DEFAULT_LOCALE` — `locale` field, defaults to `'en'`.
  - `NODE_FALLBACK_LOCALE` — `locale` field, defaults to `'en'`.
  - `NODE_SUPPORTED_LOCALES` — `locales` field (list of allowed locale codes).
  - `NODE_LOCALE_OVERRIDE_REFRESH_MS` — `int` field, defaults to `MINUTE_MS`, minimum `1`.

## Relationships

- **`src/infrastructure/config/define.ts`** — Provides `defineConfig`, the wrapper that turns the shape object into a validated config instance.
- **`src/infrastructure/config/fields.ts`** — Supplies the field constructors (`locale`, `locales`, `int`) used to declare each entry in the shape.
- **`src/domain-primitives/time.ts`** — Source of `MINUTE_MS`, used as the default for the override-refresh interval.
- **`src/infrastructure/i18n/overrides.ts`** — Consumes the `NODE_LOCALE_OVERRIDE_REFRESH_MS` value to control how often the edited-copy overlay is re-fetched.
- **`src/infrastructure/i18n/catalog.ts`** — Sibling i18n module that reads `NODE_DEFAULT_LOCALE` / `NODE_SUPPORTED_LOCALES` when building the locale catalog.
- **`src/app/config.ts`** — Top-level app config that aggregates (or re-exports) `localeConfig` for the rest of the application.
- **`src/modules/users/model.ts`** — May reference the default/supported locales when modeling user language preferences.

## Notes

- The file is purely declarative — no runtime logic beyond field defaults. All validation (type, min-value, allowed codes) is delegated to the `fields` constructors.
- `NODE_SUPPORTED_LOCALES` has **no** `default` argument; it must be supplied by the deployment environment.
- The module JSDoc points to `docs/tools/configuration.md` for operator-facing documentation of these variables.
