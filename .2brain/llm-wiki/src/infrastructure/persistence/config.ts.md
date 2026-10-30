---
source: src/infrastructure/persistence/config.ts
sha256: 0a6b09d6d69b2bb27367bf351eb77ab9257ebbbdf18195f41b947ff15635e880
generated_at: 2026-10-29T02:12:11.652315+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/persistence/config.ts

## Purpose
Declares the persistence-layer configuration surface — currently a single setting for the default pagination page size — using the project's typed config framework. It isolates persistence-specific knobs so that consumers (e.g. search) read one stable config object rather than raw environment variables.

## Key elements
- **`persistenceConfig`** (exported) — A config object created via `defineConfig` with name `"persistence"`. Contains one field:
  - **`NODE_SETTINGS_PAGINATION_PAGE_SIZE`** — `int` field; default taken from `sharedDefaults.pagination.pageSize`, minimum `1`.

## Relationships
- **`src/infrastructure/config/define.ts`** — Provides `defineConfig`, the factory that produces the typed config object exported here.
- **`src/infrastructure/config/fields.ts`** — Provides the `int` field validator/constraint used for the page-size field.
- **`src/infrastructure/config/defaults.generated.ts`** — Source of the fallback value (`sharedDefaults.pagination.pageSize`).
- **`src/app/config.ts`** — Top-level application config; expected to register or aggregate `persistenceConfig` into the global config tree.
- **`src/infrastructure/persistence/search.ts`** — Downstream consumer; reads `NODE_SETTINGS_PAGINATION_PAGE_SIZE` to control result-set paging.

## Notes
- The field name is prefixed `NODE_SETTINGS_` even though this is a persistence-domain config, indicating the env-var naming convention is shared across modules rather than scoped to the file's domain.
- `defaults.generated.ts` is auto-generated; change the default by editing its generator, not by hard-coding a number here.
- Adding a new persistence field means extending the `shape` object and (if needed) updating the generated defaults — no other wiring required.
