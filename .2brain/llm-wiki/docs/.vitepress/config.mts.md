---
source: docs/.vitepress/config.mts
sha256: e15e9ecf49261ecebf1ebedb8491054bb9bc4954ec91addec36be81a78d845fe
generated_at: 2026-09-27T13:48:02.658930+00:00
model: ollama:qwen3.8:27b
---

# docs/.vitepress/config.mts

## Purpose

VitePress site configuration that defines the title, navigation, section-specific sidebars, local search, and enables Mermaid diagram rendering for the project documentation site. It exists so that `vitepress dev` / `vitepress build` produce a navigable, searchable doc site for the Express + MongoDB + Mongoose REST boilerplate.

## Key elements

- **`withMermaid(…)`** — wraps the entire VitePress config (from `vitepress-plugin-mermaid`) to add Mermaid diagram support to Markdown pages.
- **`defineConfig(…)`** — standard VitePress config factory; the object returned becomes the default export.
- **`title` / `description`** — site metadata ("Boilerplate Node Backend"; "ADHD-friendly docs…").
- **`themeConfig.search`** — enables the built-in local (client-side) search index.
- **`themeConfig.nav`** — top navigation bar with 9 links: Home, Start, Start (Production), Demo Shop, Theory, Modules, Tools, API, Files.
- **`themeConfig.sidebar`** — path-keyed sidebar definitions for four sections:
  - `/demo-ecommerce/` — flat list of 8 pages (overview, roles, scope).
  - `/theory/` — 16 top-level entries including a nested, collapsed **Web Attacks & Defences** group with 20 sub-pages.
  - `/modules/` — three tiers (*core*, *supporting*, *generic*) covering ~22 modules, some with child pages (e.g. cart → Checkout, account → Sessions / 2FA / OAuth).
  - `/tools/` — overview, setup steps, and (truncated) additional entries.

## Relationships

No dependency-graph neighbors are recorded for this file.

## Notes

- The sidebar is **path-scoped**: only the four listed prefixes get a custom sidebar. Other top-level sections (e.g. `/api/`, `/reference/`) either rely on VitePress's auto-generated sidebar or define their own elsewhere.
- The "Web Attacks & Defences" group ships with `collapsed: true`, hiding its 20 children until expanded.
- `withMermaid` must wrap the final config object; placing it *inside* the config would not activate the plugin.
- The file content was truncated in the source snapshot; the `/tools/` sidebar and any entries after it are not fully visible.
