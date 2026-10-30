---
source: src/modules/sitemap/module.ts
sha256: dbca348178089281b17e2b1e83d6d896e960da246da87c5b6313ccc17e25bf28
generated_at: 2026-10-29T05:53:47.887529+00:00
model: ollama:qwen3.8:27b
---

# src/modules/sitemap/module.ts

## Purpose

Module manifest for the **sitemap** feature. It declares how the `sitemap.xml` endpoint is mounted into the application (route table, config slice, personal-data classification) so the kernel registry can wire it in. The module itself owns no collection; it reads `products` and `locales` through their services to build the XML on request.

## Key elements

- **default export** – An object satisfying the `AppModule` type from `@kernel/registry`.
  - `name`: `'sitemap'`
  - `mounts`: Single entry binding the local `router` under the base path `/sitemap`.
  - `config`: `sitemapConfig.slice` (imported from `./config`).
  - `personalData`: `'none'` – the module publishes already-public addresses and stores nothing personal.

## Relationships

- **`src/kernel/registry.ts`** – Provides the `AppModule` type that this file's default export must satisfy; the registry is the consumer of this manifest.
- **`src/modules.ts`** – Aggregate module list; this file is one entry the kernel loads to discover and mount the sitemap routes.
- **`src/modules/sitemap/config.ts`** – Supplies `sitemapConfig`, whose `.slice` is attached to the manifest's `config` array.
- **`src/modules/sitemap/routes.ts`** – Supplies the `router` that is mounted at `/sitemap`.

## Notes

- The file is intentionally a thin wiring stub: all real logic lives in `routes.ts` and `config.ts`. Edit those, not this file, when changing sitemap behavior.
- `personalData: 'none'` is a deliberate declaration, not an omission—the module reads public product/locale data and never persists user-specific records.
