---
source: src/infrastructure/i18n/config.ts
sha256: 28767e443d806ebfc3902643c08345d77abbd7a38b81ecf971339cbda27e7f3d
generated_at: 2026-11-08T03:36:26.242726+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/i18n/config.ts

## Purpose

Declares the typed, validated configuration surface for the internationalization layer: which locale is default, which is fallback, the list of supported locales, and the refresh interval for the edited-copy override overlay. It centralises these knobs so the rest of the i18n subsystem reads them from a single, validated source.

## Key elements

- **`localeConfig`** (exported const) — The sole export. A `defineConfig` instance named `'locales'` containing four fields:
  - `NODE_DEFAULT_LOCALE` — `text`, default `'en'`.
  - `NODE_FALLBACK_LOCALE` — `text`, default `'en'`.
  - `NODE_SUPPORTED_LOCALES` — `csv()` (comma-separated list of locale codes).
  - `NODE_LOCALE_OVERRIDE_REFRESH_MS` — `int`, default `MINUTE_MS`, minimum `1`. Controls how often the override layer polls for edited copy.

## Relationships

- **`@infrastructure/config/define`** — Provides the `defineConfig` factory that gives `localeConfig` its validation and schema metadata.
- **`@infrastructure/config/fields`** — Provides the `text`, `csv`, and `int` field-type constructors used to shape each config key.
- **`@domain-primitives/time`** — Supplies the `MINUTE_MS` constant used as the default refresh interval.
- **`src/app/config.ts`** — Top-level application config; expected to aggregate or re-export `localeConfig` so it is accessible app-wide.
- **`src/infrastructure/i18n/catalog.ts`** — Consumes the supported-locales list to determine which translation catalogs to load.
- **`src/infrastructure/i18n/overrides.ts`** — Reads `NODE_LOCALE_OVERRIDE_REFRESH_MS` to schedule its refresh cycle.
- **`src/modules/users/model.ts`** — Likely references the locale config when persisting or validating a user's preferred language.

## Notes

- All four fields are prefixed `NODE_`, following the project convention that environment-driven config keys carry that prefix.
- `NODE_SUPPORTED_LOCALES` uses `csv()` rather than an array type; callers must split/parse the value themselves.
- The default and fallback locales are both `'en'` out of the box; they are independent fields and can be set to different values per deployment.
- The refresh interval has a hard floor of `1` ms enforced by the schema (`min: 1`), so a zero value is rejected at config-validation time.
