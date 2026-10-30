---
source: src/modules/sitemap/config.ts
sha256: 2ed85f7113e2971d1a331994590bbb506e82f4dec8add168b647b35ec51829b1
generated_at: 2026-10-29T05:53:02.408996+00:00
model: ollama:qwen3.8:27b
---

# src/modules/sitemap/config.ts

## Purpose

Defines the sitemap module's configuration surface: the per-file URL limit (a deployment-tunable value) and the list of static frontend pages (a fixed fact derived from the router rules). It exists to keep these two kinds of knowledge separate — one is a product-page setting, the other is a property of the paired frontend.

## Key elements

- **`SITEMAP_URL_LIMIT`** (module-private const) — `50_000`, the sitemaps.org protocol ceiling on `<url>` entries in a single file.
- **`STATIC_PAGES`** (export, `readonly string[]`) — Paths under `/<locale>/` for public frontend pages that take no id (`''` = home). Sourced from `FRONTEND_LINK_RULES.staticPages`.
- **`sitemapConfig`** (export, config object) — Built with `defineConfig`; exposes one field, `NODE_SITEMAP_URL_LIMIT` (`int`, default `50_000`, min 1, max 50 000). Read per call so tests can vary it.

## Relationships

- **`src/infrastructure/config/define.ts`** — Provides `defineConfig`, the builder used to construct `sitemapConfig`.
- **`src/infrastructure/config/fields.ts`** — Provides the `int` field descriptor for validation (min/max) on `NODE_SITEMAP_URL_LIMIT`.
- **`src/infrastructure/http/frontend-link.ts`** — Exports `FRONTEND_LINK_RULES`, from which `STATIC_PAGES` is derived.
- **`src/modules/sitemap/module.ts`** — Consumer of this module's exports (config and page list) within the sitemap module wiring.
- **`src/modules/sitemap/service.ts`** — Consumes `sitemapConfig` and `STATIC_PAGES` when generating sitemap output.

## Notes

- `STATIC_PAGES` is deliberately **not** deployment configuration; it mirrors the frontend router and changes only when the router does. The doc comment draws this line explicitly.
- `NODE_SITEMAP_URL_LIMIT` can only be **lowered** below the protocol ceiling (max is pinned to `SITEMAP_URL_LIMIT`), never raised. The lower bound exists to make file-splitting observable in tests.
