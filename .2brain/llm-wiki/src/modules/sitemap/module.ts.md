---
source: src/modules/sitemap/module.ts
sha256: dbca348178089281b17e2b1e83d6d896e960da246da87c5b6313ccc17e25bf28
generated_at: 2026-11-08T08:22:32.170785+00:00
model: ollama:qwen3.8:27b
---

# src/modules/sitemap/module.ts

## Purpose
Module manifest for the **sitemap** feature. It declares the module's route mount point, configuration slice, and data-ownership policy so the kernel can register and serve `sitemap.xml` from the live product catalogue without the module owning any collection of its own.

## Key elements
- **`export default { … } satisfies AppModule`** — The sole export. A typed manifest object with:
  - `name: 'sitemap'`
  - `mounts` — registers the router at `basePath: '/sitemap'`
  - `config: [sitemapConfig.slice]` — exposes a config slice (not the full object) for the kernel to read
  - `personalData: 'none'` — declares the module publishes only already-public addresses; no PII is handled

## Relationships
- **`src/kernel/registry.ts`** — Provides the `AppModule` type that this manifest must satisfy.
- **`src/modules/sitemap/config.ts`** — Supplies `sitemapConfig`, from which the manifest exposes only `.slice`.
- **`src/modules/sitemap/routes.ts`** — Supplies the Hono (or similar) `router` that gets mounted at `/sitemap`.
- **`src/modules.ts`** — Aggregates module manifests (including this one) so the kernel can discover and mount all modules.
- **`src/modules/sitemap/openapi.yaml`** — OpenAPI spec for the sitemap endpoints defined in `routes.ts`; not imported here but part of the same feature.

## Notes
- `config` exposes **`sitemapConfig.slice`**, not `sitemapConfig` itself — the kernel only sees the declared slice; the full config object stays module-private.
- The module deliberately declares `personalData: 'none'`; it reads `products` and `locales` through their respective services rather than owning collections.
- The JSDoc links to `docs/modules/sitemap.md` for design rationale beyond what the manifest expresses.
