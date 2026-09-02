# docs/.vitepress/config.mts

## Purpose

VitePress site configuration that defines the documentation layout for the "Boilerplate Node Backend" project. It sets the site metadata, enables local search, configures the top navigation bar, and declares the sidebar structure for every documentation section (Demo Shop, Theory, Modules, Tools, API/Reference). Mermaid diagram rendering is enabled via the `vitepress-plugin-mermaid` wrapper.

## Key elements

- **`export default withMermaid(defineConfig({ … }))`** — the sole export; wraps the standard VitePress config with the Mermaid plugin so `.md` files can render Mermaid diagrams.
- **`title` / `description`** — site-level metadata used in the browser tab and SEO.
- **`themeConfig.search.provider: 'local'`** — activates client-side full-text search (no external service).
- **`themeConfig.nav`** — top-level navigation links (Home, Start, Start (Production), Demo Shop, Theory, Modules, Tools, API, Files).
- **`themeConfig.sidebar`** — a record keyed by URL prefix, each containing an array of collapsible section objects (`text`, `items`, optional `collapsed`, optional nested `items`). Covers:
  - `/demo-ecommerce/` — 5 role-based pages.
  - `/theory/` — 15 pages covering DDD, request flow, security, data protection.
  - `/modules/` — grouped into **core**, **supporting**, and **generic** categories; some entries have child pages (e.g. cart → Checkout, inventory → Reservations).
  - `/tools/` — grouped into Setup, Database, Messaging, Observability, Analytics, and Testing sub-sections (largest sidebar, ~40 links).
  - `/reference/` — file-glossary pages mapped to source directories.

## Relationships

No dependency-graph neighbors are registered for this file. It is a leaf configuration consumed only by the VitePress build toolchain.

## Notes

- The sidebar is **per-section**, not global: each URL prefix gets its own sidebar, so a reader on `/modules/` never sees the `/tools/` sidebar and vice-versa.
- New documentation pages must be added to both the relevant `sidebar` entry (for discoverability) and, if they are top-level sections, the `nav` array.
- The `collapsed: false` property is set explicitly on most section objects; omitting it defaults to `true`, which is likely why it is spelled out here.
- The file uses the `.mts` extension (ESM + TypeScript), consistent with VitePress ≥ 1.0 conventions; it is not imported by application code, only by the `vitepress` CLI.
