# docs/tools/index.md

## Purpose

Serves as the landing page and table-of-contents for the entire `docs/tools/` section. It explains *why* each dependency exists, provides a visual tool-map (Mermaid flowchart), and routes readers to the correct tool-specific page based on intent (core, async, observability, project workflow).

## Key elements

- **Tool map (Mermaid `flowchart LR`)** — groups all tools into four subgraphs (Core, Async, Observability, Project) and draws the data-flow edges: OTel → Tempo → Grafana, Winston → Loki → Grafana, Prometheus → Grafana.
- **"Read by intent" table** — 20+ rows mapping a group, a link to the detail page, and a one-line description of what that page covers. This is the primary navigation aid for both humans and AI.
- **"Why this section is bigger now" note** — explains that the boilerplate ships opinionated tooling beyond the basic Express + Mongo pair, justifying the one-page-per-tool structure.
- **OpenAPI carve-out callout** — explicitly states that API-specific tooling (OpenAPI Generator, Spectral, Prism, etc.) lives under `../api/`, not here.

## Relationships

- **`docs/tools/loki.md`** — linked directly in the "Read by intent" table (Observability row); described as the log-storage backend that Winston writes into and Grafana reads from.
- **`docs/tools/mongodb-mongoose.md`** — linked directly in the table (Core row); the document store and schema/model layer the whole app persists to.
- **`docs/tools/i18n.md`** — related via the Runtime row (i18next is listed as a core runtime package in `./runtime.md`); the i18n page is a deeper-dive neighbor for the same concern.
- **`docs/tools/integration-testing.md`** / **`docs/tools/load-testing.md`** — sit alongside `./testing-and-docs.md` in the Project group; the index page is the entry point a reader hits before drilling into any specific testing sub-page.

## Notes

- The Mermaid diagram uses `%%{init: ...}%%` for spacing tweaks; editing node labels without preserving the `\n` line-break syntax will break the rendered diagram.
- The table's "Group" column is the de-facto categorisation scheme; any new tool page must pick one of the existing groups (Core, Async, Observability, Project, API) to stay consistent.
- This page intentionally does **not** re-explain any tool — its only job is routing. If a tool's *what* or *why* is described here, it belongs on the linked detail page instead.
