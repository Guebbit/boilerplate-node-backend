---
source: docs/.vitepress/config.mts
source_sha256: ee72220243370f78405c0f7b86f903ff47093a054857f154c6cbc40b6790bde3
context_sha256: e6eeb531278f2a5010ec9687b8d8bbd443da349e9efe958b337fcc078be30216
generated_at: 2026-11-22T01:34:43.389239+00:00
model: claude-code:claude-sonnet-5-5
---

# docs/.vitepress/config.mts

## Purpose
VitePress configuration for the "Boilerplate Node Backend" docs site (an ADHD-friendly guide to an Express + MongoDB + Mongoose REST boilerplate). It defines the site metadata, the top navigation, per-section sidebars, local search, a custom Mermaid fence renderer, and Vite settings needed to bundle Mermaid in `docs:dev`.

## Key elements
- **`mermaidAliases`** – maps Mermaid's CommonJS-only helpers (`dayjs/plugin/*.js`, plus a `cytoscape` UMD build path) to their ESM builds. Same list the retired `vitepress-plugin-mermaid` carried.
- **Default export (`defineConfig`)** – the whole site config:
  - `title`, `description`, `lastUpdated: true`.
  - `markdown.config(md)` – overrides the markdown-it `fence` rule: a ```` ```mermaid ```` block renders as `<MermaidDiagram code="…" />` (content passed through `encodeURIComponent`); every other fence falls back to the original renderer (or `self.renderToken`).
  - `vite.optimizeDeps.include` – pre-bundles `@braintree/sanitize-url`, `dayjs`, `debug`, `cytoscape-cose-bilkent`, `cytoscape`.
  - `vite.resolve.alias` – applies `mermaidAliases`.
  - `themeConfig.search` – `provider: 'local'`.
  - `themeConfig.nav` – Home, Use the Shop, Understand, Build, Modules, Operate, Reference; each section links to `/<section>/start`.
  - `themeConfig.sidebar` – hand-written sidebars keyed by path prefix (`/use-the-shop/`, `/understand/`, and further sections beyond what is shown here). Sections are grouped (e.g. Start, The shape, Access, Mechanisms), and many entries are nested with `collapsed: true` sub-pages (e.g. Layers, Modules, Strategic/Tactical DDD, Request Flow, Write Methods, Authorization, Security).

## Relationships
- Imports `moduleSidebar` and `readCatalog` from `scripts/docs/module-catalog.ts`. These are intended to supply the generated sidebar content for the Modules section. The visible part of the file does not show how they are used.
- Also imports `fileURLToPath` from `node:url`; its use is not visible in the shown portion.

## Notes
- The `MermaidDiagram` component must be registered in the theme, since the fence rule emits it as a bare tag.
- Mermaid support is implemented directly in this file (fence rule + aliases + `optimizeDeps`) rather than via a plugin.
- The `Understand` sidebar uses `collapsed: true` for parents with sub-pages. Sidebar links follow a `<section>-<subtopic>` slug convention (e.g. `/understand/security-auth`).
