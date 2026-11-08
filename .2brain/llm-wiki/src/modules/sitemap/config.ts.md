---
source: src/modules/sitemap/config.ts
sha256: 2ed85f7113e2971d1a331994590bbb506e82f4dec8add168b647b35ec51829b1
generated_at: 2026-11-08T08:21:44.023656+00:00
model: ollama:qwen3.8:27b
---

# src/modules/sitemap/config.ts

## Purpose

Declares the sitemap module's runtime configuration and the list of static frontend pages it must index. It isolates the two inputs the sitemap needs at generation time: a per-deployment cap on `<url>` entries per file, and the deployment-independent set of public pages derived from the frontend's link rules.

## Key elements

- **`SITEMAP_URL_LIMIT`** (module-local const, `50_000`) — the sitemaps.org protocol ceiling on `<url>` entries in a single sitemap file. Not exported; used only as the default and max for the config field.
- **`STATIC_PAGES`** (exported `readonly string[]`) — the public, id-less frontend routes (e.g. `''` for home) as paths under `/<locale>/`. Sourced from `FRONTEND_LINK_RULES.staticPages`; it is *not* per-deployment configuration.
- **`sitemapConfig`** (exported via `defineConfig`) — the module's config object. Contains a single field:
  - `NODE_SITEMAP_URL_LIMIT` (`int`, default `50_000`, min `1`, max `50_000`) — the effective per-file URL cap; can be lowered for testing file-split behaviour but never raised above the protocol limit.

## Relationships

- **`src/infrastructure/config/define.ts`** — provides `defineConfig`, the factory used to build `sitemapConfig`.
- **`src/infrastructure/config/fields.ts`** — provides the `int` field descriptor used to type `NODE_SITEMAP_URL_LIMIT`.
- **`src/infrastructure/http/frontend-link.ts`** — provides `FRONTEND_LINK_RULES`, whose `staticPages` array is re-exported as `STATIC_PAGES`.
- **`src/modules/sitemap/module.ts`** — sibling consumer; registers the sitemap module and wires in this config.
- **`src/modules/sitemap/service.ts`** — sibling consumer; reads `sitemapConfig` per call to determine the URL limit and uses `STATIC_PAGES` when building sitemap content.

## Notes

- `NODE_SITEMAP_URL_LIMIT` is intentionally capped at the protocol constant (`max: SITEMAP_URL_LIMIT`); it is a *lowering* knob for tests, not a tuning parameter.
- `STATIC_PAGES` is derived from the shared frontend-link YAML rules, so adding a page to the frontend router updates the sitemap source list without touching this file.
- `sitemapConfig` is read on every call (not cached at module load) specifically so tests can swap the limit without restarting.
