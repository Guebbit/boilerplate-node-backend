---
source: src/modules/locales/config.ts
sha256: 998649025a1ee0f35613b57b8f54ff85f9893fa29f641dd0d4de25fc6dc65ec0
generated_at: 2026-11-08T06:20:22.284562+00:00
model: ollama:qwen3.8:27b
---

# src/modules/locales/config.ts

## Purpose

Declares the locales module's configuration schema — specifically, which app IDs this deployment holds translation strings for. It is a pure definition file; consumers read the resolved values via `./apps.ts` rather than importing this file directly.

## Key elements

- **`localesConfig`** (exported const) — A `defineConfig` instance named `'locales-apps'` with three fields:
  - `NODE_LOCALE_APP_BACKEND` — `text` field, default `'demo-be'`.
  - `NODE_LOCALE_APP_FRONTEND` — `text` field, default `'demo-fe'`.
  - `NODE_LOCALE_APPS_EXTRA` — `csv` field (comma-separated list), no default.

## Relationships

- **`src/infrastructure/config/define.ts`** — Provides the `defineConfig` factory used to build `localesConfig`.
- **`src/infrastructure/config/fields.ts`** — Provides the `text` and `csv` field-type constructors that shape each config entry.
- **`src/modules/locales/apps.ts`** — The designated reader of `localesConfig`; it resolves the field values and exposes them to the rest of the locales module.
- **`src/modules/locales/module.ts`** — Module entry point that wires the locales module together; this config file is its configuration source.

## Notes

- Do not import `localesConfig` directly elsewhere; go through `apps.ts` as indicated by the file's doc comment.
- The two `text` fields carry `'demo-*'` defaults, suggesting a non-production fallback. Production deployments are expected to override them via environment or config files.
- `NODE_LOCALE_APPS_EXTRA` has no default (no `default` option passed to `csv()`), so it resolves to an empty/undefined value unless explicitly set.
