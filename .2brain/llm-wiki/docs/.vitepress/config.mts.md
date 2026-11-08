---
source: docs/.vitepress/config.mts
sha256: da2bc7e5de322c78579f010f187759d433f0a4edb35f8c816786cd5d29a40435
generated_at: 2026-11-08T02:24:42.218439+00:00
model: ollama:qwen3.8:27b
---

# docs/.vitepress/config.mts

## Purpose

VitePress site configuration for the boilerplate's documentation. Defines the site title, navigation bar, per-section sidebars, local search, and Mermaid diagram support. It is the single entry point the `vitepress dev` / `vitepress build` commands read to render the docs.

## Key elements

- **`withMermaid`** (from `vitepress-plugin-mermaid`) — wraps the VitePress config so ` ```mermaid ` code blocks render as diagrams.
- **`defineConfig`** (from `vitepress`) — standard VitePress config factory; receives `title`, `description`, and `themeConfig`.
- **`themeConfig.search`** — enables the built-in local search provider.
- **`themeConfig.nav`** — top-level navigation bar (Home, Start, Start (Production), Start a New Project, Demo Shop, Theory, Modules, Tools, API, Files).
- **`themeConfig.sidebar`** — per-path sidebar definitions for `/demo-ecommerce/`, `/theory/`, `/modules/`, `/tools/`, and additional sections (truncated). The `/theory/` section includes a large nested "Web Attacks & Defences" group with ~20 sub-items.
- **`'/modules/'` sidebar** — generated at build time by calling `moduleSidebar(readCatalog(modulesSrcDir, docsModulesDir))` rather than being hand-written.
- **`fileURLToPath(new URL(...))`** — resolves the two directory paths (source modules dir and docs modules dir) relative to `import.meta.url` for the catalog reader.

## Relationships

- **`scripts/docs/module-catalog.ts`** — This config imports `readCatalog` and `moduleSidebar` from that file. `readCatalog` is called with the `src/modules` directory and the `docs/modules` directory; its return value is passed to `moduleSidebar`, which produces the sidebar array for the `/modules/` path. Adding a new module's `module.yaml` and index page automatically updates the sidebar with no edits to this file.

## Notes

- The `/modules/` sidebar is **generated**, not static. Do not hand-edit entries there; add or remove modules by creating/removing the corresponding `module.yaml` and pages in `src/modules` and `docs/modules`.
- `fileURLToPath(new URL(..., import.meta.url))` is used instead of `path.join(__dirname, ...)` because this is an ESM (`.mts`) file; `__dirname` is unavailable.
- The `withMermaid` wrapper must remain the outermost call around `defineConfig` for Mermaid blocks to render.
- The file is TypeScript (`.mts`) but is consumed by VitePress's config loader; no separate build step is needed.
