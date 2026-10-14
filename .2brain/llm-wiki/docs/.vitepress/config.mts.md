---
source: docs/.vitepress/config.mts
sha256: b370465bb2ffa781263828d87435c9e9778fa1763c6335fc884c4dccb828809e
generated_at: 2026-10-14T06:52:20.110206+00:00
model: ollama:qwen3.8:27b
---

# docs/.vitepress/config.mts

## Purpose

VitePress configuration that defines the site title, top-level navigation, per-section sidebars, local full-text search, and Mermaid diagram support for the project documentation. It also delegates the `/modules/` sidebar to a generator so adding a new module requires no manual config edit.

## Key elements

- **`withMermaid(defineConfig({ … }))`** – Wraps the entire VitePress config with the Mermaid plugin so diagrams render in Markdown pages.
- **`title` / `description`** – Site identity: "Boilerplate Node Backend", tagged as ADHD-friendly docs for the Express + MongoDB + Mongoose REST boilerplate.
- **`themeConfig.search.provider: 'local'`** – Enables VitePress's built-in client-side search (no external service).
- **`themeConfig.nav`** – Top-level navigation bar with ten entries (Home, Start, Start (Production), Start a New Project, Demo Shop, Theory, Modules, Tools, API, Files).
- **`themeConfig.sidebar['/demo-ecommerce/']`** – Static sidebar listing the demo-shop personas and scope pages.
- **`themeConfig.sidebar['/theory/']`** – Static sidebar covering architecture, DDD, request flow, security defences (a collapsed group of ~20 sub-pages), and more.
- **`themeConfig.sidebar['/modules/']`** – Dynamically built by calling `moduleSidebar(readCatalogue(srcDir, docsDir))` (see Relationships).
- **`themeConfig.sidebar['/tools/']`** – Static sidebar with Overview, Setup (20+ items), and Database (truncated) groups.
- **`fileURLToPath(new URL(…))`** – Resolves `src/modules` and `docs/modules` paths relative to this file's location for the catalogue call.

## Relationships

- **`scripts/docs/module-catalogue.ts`** – Exports `readCatalogue` (scans `src/modules/*/module.yaml` and sibling doc pages) and `moduleSidebar` (maps the catalogue data into a VitePress sidebar array). This file calls both to produce the `/modules/` sidebar at build time, so the config stays in sync with the module tree without manual edits.

## Notes

- The `/modules/` sidebar is **generated**, not hand-maintained. The inline comment explicitly says "Nothing to edit when a module is added."
- The file uses ESM (`import.meta.url`) and is typed as `.mts` (TypeScript + ESM), consistent with the rest of the repo's tooling.
- Sidebar groups can carry a `collapsed: true` flag (used on "Web Attacks & Defences" and several `/tools/` sections) to keep the nav compact by default.
- The nav order is the canonical reading order for new contributors; keep it aligned with the `getting-started` pages.
