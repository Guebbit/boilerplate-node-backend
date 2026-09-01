# docs/.vitepress/config.mts

## Purpose

VitePress configuration file that defines the site title, description, local search, top-level navigation, and the full sidebar structure for the project's documentation site. It also wraps the config with the Mermaid plugin so diagram blocks render natively in the docs.

## Key elements

- **`withMermaid(...)`** – Wraps the VitePress config (from `vitepress-plugin-mermaid`) to enable Mermaid sequence/flowchart rendering in Markdown pages.
- **`defineConfig({...})`** – Standard VitePress entry point; the exported default is `withMermaid(defineConfig(...))`.
- **`title` / `description`** – Site-level metadata shown in the browser tab and used for SEO; identifies this as an "ADHD-friendly docs" project for an Express + MongoDB + Mongoose REST boilerplate.
- **`themeConfig.search.provider: 'local'`** – Enables VitePress's built-in local search (no external service).
- **`themeConfig.nav`** – Top-level navigation bar with seven entries: Home, Start, Theory, Modules, Tools, API, Files.
- **`themeConfig.sidebar`** – Per-section sidebar definitions keyed by path prefix (`/theory/`, `/modules/`, `/tools/`, `/reference/`, `/api/`). Each entry is a grouped list of links, some with nested sub-items (e.g., cart → Checkout, inventory → Reservations).

## Relationships

No dependency-graph neighbors are recorded for this file. It is a leaf config consumed by the VitePress CLI at build/dev time.

## Notes

- The file is truncated in the source above (the `/api/` sidebar section is cut off), so the full sidebar may contain additional entries beyond what is visible.
- Sidebar group objects use a `collapsed: false` flag on most section headers, meaning those groups render expanded by default.
- Adding a new documentation page requires updating the corresponding sidebar array here (or the page will be unreachable from the sidebar) and, if it's a new top-level section, adding a `nav` entry as well.
- The Mermaid plugin wrapper must remain the outermost call; placing `defineConfig` outside `withMermaid` would break diagram rendering.
