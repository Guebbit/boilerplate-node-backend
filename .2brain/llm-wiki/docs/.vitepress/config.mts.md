---
source: docs/.vitepress/config.mts
sha256: 3132b87127563f538c7c9e59015884b59575171de5c520330e836ade1cc0a42e
generated_at: 2026-10-01T12:18:27.948274+00:00
model: ollama:qwen3.8:27b
---

# docs/.vitepress/config.mts

## Purpose

VitePress site configuration that defines the title, navigation bar, per-section sidebars, and local search for the project's documentation site. It wraps the config with `withMermaid` so Mermaid diagrams render, and dynamically generates the Modules sidebar from source data rather than hard-coding it.

## Key elements

- **`withMermaid(defineConfig({...}))`** — wraps the entire VitePress config to enable Mermaid diagram support site-wide.
- **`title` / `description`** — site metadata ("Boilerplate Node Backend" / ADHD-friendly docs tagline).
- **`themeConfig.search.provider: 'local'`** — enables VitePress built-in local search (no external service).
- **`themeConfig.nav`** — top-level navigation bar with 10 sections (Home, Start, Demo Shop, Theory, Modules, Tools, API, Files, etc.).
- **`themeConfig.sidebar`** — per-path sidebar definitions:
  - `/demo-ecommerce/` — static list of 7 demo-role pages.
  - `/theory/` — static list of ~20 pages including a nested "Web Attacks & Defences" group with ~20 sub-pages.
  - `/modules/` — **dynamically generated** via `moduleSidebar(readCatalogue(...))`; reads `module.yaml` files from `src/modules/` and the corresponding doc pages from `docs/modules/`.
  - `/tools/` — static list organised into Setup, Database, Messaging, and Observability groups.
- **`fileURLToPath(new URL(..., import.meta.url))`** — resolves the two filesystem paths passed to `readCatalogue` (source modules dir and docs modules dir) relative to this config file's location.

## Relationships

- **`scripts/docs/module-catalogue.ts`** — provides `readCatalogue` (reads each module's `module.yaml` and its doc pages) and `moduleSidebar` (converts that catalogue into a VitePress sidebar structure). The `/modules/` sidebar section is entirely driven by this module; adding a new module requires no edit to this config file.

## Notes

- The `/modules/` sidebar is the only section that is **not** hand-maintained here. A new module only needs its `module.yaml` and a doc page under `docs/modules/`—the sidebar picks it up automatically at build time.
- The two `fileURLToPath` calls use `import.meta.url` (ESM) rather than `__dirname`. If the project ever reverts to CommonJS for this file, those lines break.
- The file is truncated in the repo view; the `/tools/` sidebar likely continues with additional groups (Observability sub-items are cut off). Treat the static lists here as the source of truth for what the site renders.
