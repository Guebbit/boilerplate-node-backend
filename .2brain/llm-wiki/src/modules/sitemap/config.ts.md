---
source: src/modules/sitemap/config.ts
source_sha256: c1cb4c41c1085bad7a2a495f6fe2db08d6320431a6666a73871ad782d0336ba0
context_sha256: 148ee37cb924af7cf3ccebb2c145abbf479ba6256daf4ecad6dfa703dc2c3db6
generated_at: 2026-11-22T07:48:07.458556+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/sitemap/config.ts

## Purpose
Declares the deployment-level settings the sitemap module needs, and exposes the list of static frontend pages. The only configurable value is the maximum number of `<url>` entries per sitemap file. Static pages are deliberately not configuration: they depend on the frontend's router, not on the deployment.

## Key elements
- `STATIC_PAGES` — `readonly string[]` of public frontend paths that take no id, relative to `/<locale>/` (`''` is the home page). It is taken directly from `FRONTEND_LINK_RULES.staticPages`.
- `sitemapConfig` — the config object built with `defineConfig({ name: 'sitemap', ... })`. It is read per call, so tests can vary it. It has one field:
  - `NODE_SITEMAP_URL_LIMIT` — an `int` field defaulting to 50,000, with `min` 1 and `max` 50,000.
- `SITEMAP_URL_LIMIT` (module-private) — the sitemaps.org ceiling of 50,000 URLs per file. It is both the default and the upper bound of the setting.

## Relationships
- `src/infrastructure/config/define.ts` — supplies `defineConfig`, used to declare `sitemapConfig`.
- `src/infrastructure/config/fields.ts` — supplies the `int` field builder.
- `src/infrastructure/http/frontend-link.ts` — supplies `FRONTEND_LINK_RULES`, the source of `STATIC_PAGES`.
- `src/modules/sitemap/module.ts` and `src/modules/sitemap/service.ts` — sibling sitemap files that sit next to this config in the dependency graph. The config file itself does not show how they use it.

## Notes
- The limit can be lowered only to make file splitting visible, for example in tests. The protocol's own ceiling cannot be exceeded because of the `max` bound.
- `STATIC_PAGES` comes from `shared/rules/frontend-links.yaml`, against which the frontend's router is checked.
