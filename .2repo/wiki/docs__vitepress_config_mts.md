# docs/.vitepress/config.mts

## Purpose

VitePress site configuration that defines the documentation site's identity, navigation, sidebar structure, and plugin stack. It wraps the standard `defineConfig` call in the `withMermaid` plugin so Mermaid diagrams render natively in the docs.

## Key elements

- **`withMermaid(defineConfig(...))`** — wraps the entire config so Mermaid diagram support is enabled site-wide via `vitepress-plugin-mermaid`.
- **`title` / `description`** — site-level metadata ("Boilerplate Node Backend" / "ADHD-friendly docs for the Express + MongoDB + Mongoose REST boilerplate").
- **`themeConfig.search`** — enables VitePress built-in local search (no external search provider).
- **`themeConfig.nav`** — top-level navigation bar: Home, Start, Theory, Modules, Tools, API, Files.
- **`themeConfig.sidebar`** — per-path sidebar definitions for five sections (`/theory/`, `/modules/`, `/tools/`, `/reference/`, `/api/`). Each sidebar groups pages into collapsible categories (e.g. modules split into *core*, *supporting*, *generic*; tools split into *Setup*, *Database*, *Messaging*, *Observability*, *Analytics*, *Testing*).
- **`themeConfig.socialLinks`** — social/repository links (GitHub icon link visible; list truncated in source).

## Relationships

No graph neighbors are recorded for this file. It is a leaf configuration consumed by the VitePress build tooling (`vitepress` CLI) and the `vitepress-plugin-mermaid` package.

## Notes

- The sidebar is **path-keyed**: each key (e.g. `'/tools/'`) only applies to pages under that prefix. There is no global fallback sidebar defined, so pages outside these five roots will render with no sidebar.
- Sidebar items with nested `items` arrays (e.g. `cart → Checkout`, `inventory → Reservations`) produce two-level nesting in the rendered tree.
- `collapsed: false` is set explicitly on most groups, meaning they are **expanded by default**. Omitting the flag would also default to expanded in VitePress, so the explicit setting is redundant but makes intent visible.
- Adding a new docs page requires adding a corresponding entry in the matching sidebar block; VitePress will not auto-generate sidebar entries.
- The file uses `.mts` (ESM TypeScript) extension, consistent with VitePress's requirement for ESM config.
