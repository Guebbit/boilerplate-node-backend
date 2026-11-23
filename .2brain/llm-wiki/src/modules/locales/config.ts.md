---
source: src/modules/locales/config.ts
source_sha256: 998649025a1ee0f35613b57b8f54ff85f9893fa29f641dd0d4de25fc6dc65ec0
context_sha256: 7dffd5d3d41cd2264f6be98567e456641fa919cbb90c3b3459e188ff8603aed5
generated_at: 2026-11-22T05:41:41.784760+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/locales/config.ts

## Purpose
Defines the locales module's configuration slice: which translation apps this deployment holds words for. The values are not read directly from this file; they are read through `./apps.ts`.

## Key elements
- `localesConfig` — the exported config object, created with `defineConfig` under the name `locales-apps`. Its shape has three fields:
  - `NODE_LOCALE_APP_BACKEND` — `text` field, defaults to `'demo-be'`.
  - `NODE_LOCALE_APP_FRONTEND` — `text` field, defaults to `'demo-fe'`.
  - `NODE_LOCALE_APPS_EXTRA` — `csv` field with no default, for additional app ids.

## Relationships
- `src/infrastructure/config/define.ts` — supplies `defineConfig`, which builds the config slice.
- `src/infrastructure/config/fields.ts` — supplies the `text` and `csv` field builders used in the shape.
- `src/modules/locales/apps.ts` — the intended reader of `localesConfig`, per the module doc comment.
- `src/modules/locales/module.ts` — a graph neighbor. The file content shows no direct interaction with it.

## Notes
- Because of the defaults, a deployment with no env vars set uses the demo app ids `demo-be` and `demo-fe`.
- Go through `./apps.ts` for app ids rather than reading `localesConfig` directly.
