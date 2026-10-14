---
source: src/infrastructure/persistence/config.ts
sha256: 1a7de91d9b6adf901e4196792d0ea38aad83e420716045b61792dac4d78eea0e
generated_at: 2026-10-14T08:08:31.383681+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/persistence/config.ts

## Purpose

Defines the persistence domain's configuration schema: a single setting, `NODE_SETTINGS_PAGINATION_PAGE_SIZE`, with a default of 10 and a minimum of 1. It exists so the rest of the codebase has a typed, validated reference for the default page size used in paginated queries.

## Key elements

- **`persistenceConfig`** (exported constant) — The config object produced by `defineConfig`. Its `shape` declares one field:
  - `NODE_SETTINGS_PAGINATION_PAGE_SIZE` — an integer field (via the `int` validator) with `default: 10` and `min: 1`.

## Relationships

- **`src/infrastructure/config/define.ts`** — Provides the `defineConfig` helper used to construct the typed config object.
- **`src/infrastructure/config/fields.ts`** — Provides the `int` field validator that constrains the page-size value.
- **`src/app/config.ts`** — Sits at the application level in the same graph; likely aggregates `persistenceConfig` alongside other domain configs.
- **`src/infrastructure/persistence/search.ts`** — Same persistence domain; expected consumer of the page-size value for paginated queries.

## Notes

- The config is a *schema definition* (shape + defaults), not a resolved runtime value. Actual values are read from `NODE_SETTINGS_*` environment variables at runtime by the config framework.
- Changing the default page size here changes the fallback; explicit `NODE_SETTINGS_PAGINATION_PAGE_SIZE` env values still override it.
