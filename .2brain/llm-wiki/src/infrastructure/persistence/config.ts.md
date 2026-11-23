---
source: src/infrastructure/persistence/config.ts
source_sha256: b693b211edd37ba24a64f63bf95763ed984043d291e8100c38ecf9594a14ddb7
context_sha256: 610f664892d70d57486f5c20f7e4c9fea403ee24d5d3d156b4164de128df3f27
generated_at: 2026-11-22T03:01:51.268545+00:00
model: claude-code:claude-sonnet-5-5
---

# src/infrastructure/persistence/config.ts

## Purpose
Declares the persistence module's configuration: currently a single setting, the default page size used for paging. It builds a typed config object via the shared config framework, with the default value drawn from generated shared defaults.

## Key elements
- `persistenceConfig` — the exported result of `defineConfig({ name: 'persistence', shape: {...} })`.
  - `NODE_SETTINGS_PAGINATION_PAGE_SIZE` — an `int` field with a minimum of `1` and a default of `sharedDefaults.pagination.pageSize`.

## Relationships
- Uses `defineConfig` from `src/infrastructure/config/define.ts` to create the config section, and the `int` field builder from `src/infrastructure/config/fields.ts` to declare and validate the value.
- `src/app/config.ts` and `src/infrastructure/persistence/search.ts` are graph neighbors. Their exact interaction isn't visible in this file, but the config is presumably consumed by them (for example, the app config aggregating it and search using the page size).

## Notes
- The env var name is `NODE_SETTINGS_PAGINATION_PAGE_SIZE`. The default is not hardcoded here and comes from `sharedDefaults` (imported from a generated defaults module), so change it at that source rather than in this file.
- Values below `1` are rejected by the `min: 1` constraint.
- The module doc comment references a configuration ownership section ("who-owns-what") in the project's configuration docs.
