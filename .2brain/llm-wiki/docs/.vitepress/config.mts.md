---
source: docs/.vitepress/config.mts
sha256: 6725a83ab21e27b43ede4e8ccec4b3f801a3496422b6b0a57f69bbae9b4a52b3
generated_at: 2026-10-07T23:48:38.373389+00:00
model: ollama:qwen3.8:27b
---

# docs/.vitepress/config.mts

## Purpose

VitePress site configuration for the project's documentation. Defines the site title, navigation bar, per-section sidebars, local search, and Mermaid diagram rendering. The `/modules/` sidebar is generated at build time from each module's `module.yaml` rather than maintained by hand.

## Key elements

- **`export default withMermaid(defineConfig({...}))`** — Composes the base VitePress config with the Mermaid plugin wrapper so `.md` files can render Mermaid diagrams natively.
- **`themeConfig.search`** — Enables VitePress's built-in local (client-side) full-text search; no external provider.
- **`themeConfig.nav`** — Top-level navigation links: Home, Start, Start (Production), Start a New Project, Demo Shop, Theory, Modules, Tools, API, Files.
- **`themeConfig.sidebar`** — Per-prefix sidebar trees. Hand-written entries for `/demo-ecommerce/`, `/theory/`, `/tools/`, and (truncated) likely `/api/` and `/reference/`. The `/modules/` entry is **generated** via `moduleSidebar(readCatalogue(...))`.
- **`readCatalogue(srcModulesPath, docsModulesPath)`** — Reads every `src/modules/*/module.yaml` and the adjacent docs pages, returning a structured catalogue.
- **`moduleSidebar(catalogue)`** — Converts that catalogue into a VitePress sidebar array, so adding/removing a module requires no edit to this file.

## Relationships

- **`scripts/docs/module-catalogue.ts`** — Provides `readCatalogue` and `moduleSidebar`. This file calls them with two resolved paths:
  - `../../src/modules` (source of truth: `module.yaml` per module)
  - `../modules` (the `docs/modules/` directory containing the `.md` pages)
  The returned sidebar array is spliced directly into the `/modules/` key of `themeConfig.sidebar`.

## Notes

- The `/modules/` sidebar is **fully generated**. Do not add or remove entries there manually; create or delete the module under `src/modules/` and its docs pages instead.
- `fileURLToPath(new URL(..., import.meta.url))` is used to resolve relative paths at runtime (ESM-style), avoiding fragile `__dirname` assumptions.
- The config file is TypeScript (`.mts`) but is consumed by VitePress, not by the application runtime.
- The `theory/defences/` section is deeply nested and uses `collapsed: true` to keep the sidebar readable.
