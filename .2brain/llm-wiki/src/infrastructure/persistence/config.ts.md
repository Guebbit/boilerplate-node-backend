---
source: src/infrastructure/persistence/config.ts
sha256: 0a6b09d6d69b2bb27367bf351eb77ab9257ebbbdf18195f41b947ff15635e880
generated_at: 2026-11-08T03:42:13.022749+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/persistence/config.ts

## Purpose

Defines the persistence-layer configuration schema, currently a single field for the default pagination page size. It exists so that pagination defaults are declared once, validated, and referenced consistently across persistence concerns (e.g. search).

## Key elements

- **`persistenceConfig`** (exported const) — A config object created via `defineConfig` with name `'persistence'`. Contains one shape field:
  - `NODE_SETTINGS_PAGINATION_PAGE_SIZE` — An `int` field whose default comes from `sharedDefaults.pagination.pageSize` and whose minimum value is `1`.

## Relationships

- **`@infrastructure/config/define`** → provides `defineConfig`, the factory used to build the typed config object.
- **`@infrastructure/config/fields`** → provides the `int` field descriptor (type, validation constraints) applied to the page-size field.
- **`@infrastructure/config/defaults.generated`** (imported, not in listed neighbors) → supplies the generated default value for the page size.
- **`src/infrastructure/persistence/search.ts`** → downstream consumer; search pagination reads the value of `NODE_SETTINGS_PAGINATION_PAGE_SIZE` from this config.
- **`src/app/config.ts`** → app-level entry point where `persistenceConfig` is likely registered or merged into the global configuration bundle.

## Notes

- The default is sourced from a **generated** file (`defaults.generated`), so the actual numeric default is not hard-coded here. Regenerate that file if the baseline page size changes.
- Only one field is currently defined; adding new persistence settings (e.g. timeout, batch size) would follow the same `int` / field-descriptor pattern within the existing `shape`.
