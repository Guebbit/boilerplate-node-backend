---
source: src/modules/sitemap/module.ts
source_sha256: fd879e559cce8513b1c1c8550537da02efc6d0694c2939ccee46699ad1ec1da7
context_sha256: 80183db8619d44fdf6e88e3a331d6d12cfb415e5d8f364274bd05c6c965a7e1b
generated_at: 2026-11-22T07:48:55.261453+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/sitemap/module.ts

## Purpose
Declares the manifest entry for the `sitemap` module, which serves `sitemap.xml` for search engines. The sitemap is built on request from the live catalogue. The module owns no collection of its own and reads `products` and `locales` through their services.

## Key elements
- **default export** – an object that satisfies the `AppModule` type, with these fields:
  - `name: 'sitemap'`
  - `mounts`: a single mount at `basePath: '/sitemap'` that uses the `router` imported from `./routes`.
  - `config`: `[sitemapConfig.slice]`, which registers the module's settings slice from `./config`.
  - `personalData: 'none'`: the module owns no collection and publishes only addresses that are already public.

## Relationships
- `src/kernel/registry.ts`: supplies the `AppModule` type that this manifest must satisfy.
- `src/modules/sitemap/routes.ts`: supplies the `router` that is mounted at `/sitemap`.
- `src/modules/sitemap/config.ts`: supplies `sitemapConfig`. Its `slice` is the module's config contribution.
- `src/modules.ts`: a graph neighbor of this file. The file's content does not show how the two interact.
- `src/modules/products/module.ts`: the header comment says the sitemap reads `products` through its service. This file does not import it.

## Notes
- The file contains only declarations. The sitemap-building logic is not in this file.
