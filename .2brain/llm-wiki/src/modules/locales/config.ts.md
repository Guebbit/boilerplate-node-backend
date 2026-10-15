---
source: src/modules/locales/config.ts
sha256: 998649025a1ee0f35613b57b8f54ff85f9893fa29f641dd0d4de25fc6dc65ec0
generated_at: 2026-10-15T10:41:35.678780+00:00
model: ollama:qwen3.8:27b
---

# src/modules/locales/config.ts

## Purpose

Declares the locales module's configuration slice: the set of translation app IDs this deployment holds words for. It defines the shape and defaults so the rest of the module (and any consumer) can read validated values rather than raw env vars.

## Key elements

- **`localesConfig`** (exported const) — A `defineConfig` instance named `'locales-apps'` containing three fields:
  - `NODE_LOCALE_APP_BACKEND` — `text` field, defaults to `'demo-be'`.
  - `NODE_LOCALE_APP_FRONTEND` — `text` field, defaults to `'demo-fe'`.
  - `NODE_LOCALE_APPS_EXTRA` — `csv` field, no default (empty list).

## Relationships

- **`src/infrastructure/config/define.ts`** — Provides the `defineConfig` helper that structures the exported object with a name and typed shape.
- **`src/infrastructure/config/fields.ts`** — Provides the `text` and `csv` field-constructor functions used to declare each entry's type and defaults.
- **`src/modules/locales/apps.ts`** — The documented read path for this config; it consumes `localesConfig` to resolve the actual app list at runtime.
- **`src/modules/locales/module.ts`** — The locales module entry point that incorporates the apps config into the module's public surface.

## Notes

- The file is a pure declaration — no logic, no side effects. All runtime reading is delegated to `apps.ts`.
- `NODE_LOCALE_APPS_EXTRA` uses the `csv` field type (comma-separated list), while the two app-specific fields are single `text` values. Consumers must not assume they all return the same shape.
