---
source: docs/.vitepress/config.mts
sha256: 8972ef090d68d7ed2e2f0030fde20386c98ca2604d53a0d9aee73fcc61d50765
generated_at: 2026-09-23T17:14:38.437857+00:00
model: ollama:qwen3.8:27b
---

# docs/.vitepress/config.mts

## Purpose

VitePress site configuration that defines the documentation's identity, navigation structure, and sidebar trees for the "Boilerplate Node Backend" project. It also enables Mermaid diagram rendering via a plugin wrapper.

## Key elements

- **`withMermaid` (from `vitepress-plugin-mermaid`)** — wraps the entire VitePress config so Mermaid code blocks in Markdown pages render as diagrams.
- **`defineConfig` (from `vitepress`)** — the standard config factory; receives an object with `title`, `description`, and `themeConfig`.
- **`title` / `description`** — site-level metadata ("Boilerplate Node Backend" / "ADHD-friendly docs for the Express + MongoDB + Mongoose REST boilerplate").
- **`themeConfig.search`** — uses the `local` provider (client-side, no external search service).
- **`themeConfig.nav`** — top-level navigation bar with nine links: Home, Start, Start (Production), Demo Shop, Theory, Modules, Tools, API, Files.
- **`themeConfig.sidebar`** — per-section sidebar trees keyed by path prefix (`/demo-ecommerce/`, `/theory/`, `/modules/`, `/tools/`, and presumably others past the truncation point). Each tree is a nested list of text/link items with optional `collapsed` flags and nested `items` for sub-sections.

## Relationships

No graph neighbors are recorded for this file. It is a leaf configuration file consumed by the VitePress build tooling; no other source file imports it.

## Notes

- The sidebar structure is a **manual mirror** of the `docs/` folder layout. Adding a new Markdown page under an existing section requires a corresponding entry in the sidebar array, or the page will be unreachable from the sidebar (though still reachable via URL or local search).
- The `collapsed: true` flag (e.g., on "Web Attacks & Defences") hides that sub-section by default in the rendered sidebar.
- The description string explicitly frames the docs as "ADHD-friendly," which is the project's stated design goal for information density and navigation.
- The file uses `.mts` extension (ESM TypeScript), consistent with VitePress ≥ 1.x.
