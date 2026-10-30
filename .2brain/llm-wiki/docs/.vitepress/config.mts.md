---
source: docs/.vitepress/config.mts
sha256: ca4a20e2c8bae85ce800344fbeb2a20b64a55fb52fb9f567b32fb153ec7df655
generated_at: 2026-10-29T01:19:22.535354+00:00
model: ollama:qwen3.8:27b
---

# docs/.vitepress/config.mts

## Purpose

VitePress site configuration for the project's documentation. It defines the site identity, navigation bar, sidebar structure, and enables local search and Mermaid diagram rendering. All content routing for the docs site flows through this single file.

## Key elements

- **`defineConfig({...})`** — the core VitePress config object: sets `title` ("Boilerplate Node Backend"), `description`, `themeConfig.search.provider` (local), `themeConfig.nav` (top-level links), and `themeConfig.sidebar` (per-section page trees).
- **`withMermaid(...)`** — wraps the config to activate the `vitepress-plugin-mermaid` integration so Mermaid blocks render in doc pages.
- **`moduleSidebar(readCatalogue(...))`** — imported from `scripts/docs/module-catalogue.ts`; builds the `/modules/` sidebar dynamically from each module's `module.yaml` and adjacent pages. No manual sidebar editing needed when a module is added or removed.
- **Sidebar sections** — hard-coded trees for `/demo-ecommerce/`, `/theory/` (including a large collapsible "Web Attacks & Defences" subtree), `/tools/` (Setup, Database, and further groups), plus the generated `/modules/` section. Remaining sections (`/api/`, `/reference/`) are present in the truncated portion.
- **`fileURLToPath(new URL(...))`** — used to resolve the source and docs module directories relative to this file, avoiding fragile `path.join` strings.

## Relationships

- **`scripts/docs/module-catalogue.ts`** — provides `readCatalogue` (scans `src/modules/*/module.yaml` + docs pages) and `moduleSidebar` (shapes the result into a VitePress sidebar array). This config file calls both at import time, so the `/modules/` sidebar is always in sync with the module tree.

## Notes

- The `/modules/` sidebar entry is **generated at build time**; do not add or remove module sidebar items here. Edit the module's `module.yaml` instead.
- The file is `.mts` (native Node ESM), which is why it uses `import.meta.url` rather than `__dirname`.
- Sidebar `collapsed` defaults to `true`; only groups explicitly set to `false` (e.g. Tools → Setup, Tools → Database) start expanded.
- The site description is intentionally informal ("ADHD-friendly docs"); this is the value shown in `<meta>` and search results.
