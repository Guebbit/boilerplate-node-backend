# docs/index.md

## Purpose

Landing page for the Docusaurus-based documentation site. It orients a reader (human or AI) to the boilerplate's stack, the five top-level doc sections, and the fastest paths to the info they need. All navigation, feature bullets, and diagrams live here; deeper content lives in the linked sub-pages.

## Key elements

- **Frontmatter `hero` / `actions`** – Docusaurus layout config defining the title, tagline, and the five CTA buttons (Get Started, Read Theory, Browse Modules, Explore Tools, Follow the API flow).
- **Frontmatter `features`** – Three bullet cards summarising repo shape, layer visibility, and contract-first workflow.
- **Family map (Mermaid `flowchart`)** – Positions this repo (`api-mongodb-mongoose`) among five sibling boilerplates in the "Node backend family."
- **"Read this repo as" list** – Maps abstract concepts (API, Framework, Database, Observability, Real-time, Process model, Contracts, Shape) to the specific doc page or YAML file that covers each.
- **Five sections overview** – One-paragraph descriptions of Theory, Modules, Tools, API, and Files with links into each section's index.
- **"Quick visual of the current repo" (Mermaid `flowchart`)** – End-to-end data-flow diagram: `openapi.yaml` / `asyncapi.yaml` → Routes → Controllers → Services → Repositories → Models → MongoDB, with side branches to Redis, RabbitMQ, and observability tooling.
- **Good starting points** – Curated list of entry-point pages for common reader intents (first run, domain lookup, file lookup, contract edits, observability, package map, payload changes).

## Relationships

- **`asyncapi.yaml`** – Referenced in the "Read this repo as" list and the architecture diagram as the async/realtime contract source of truth; the index page is the first place a reader learns it exists.
- **`docs/api/asyncapi-workflow.md`** – Linked from both the "Read this repo as" list and the architecture diagram caption; the index delegates the detailed AsyncAPI workflow to that page.
- **`package.json`** – Mentioned in "Good starting points" as the file to consult (via `tools/package-dependencies.md` and `tools/package-scripts.md`) for the dependency and script map.

## Notes

- The page is a **Docusaurus `layout: home`** page; its frontmatter is parsed by the Docusaurus theme, not by Markdown renderers. Editing `hero.actions` or `features` changes the rendered homepage without touching the body.
- Two Mermaid diagrams use `%%{init: ...}%%` spacing overrides; if the docs theme upgrades its Mermaid version, node overlap behaviour may shift.
- The "family map" lists sibling repos (`mvc-mongodb-mongoose`, `api-mongodb-mongoose-fastify-nestjs`, etc.) that are **not** part of this package—do not treat them as local paths.
- All internal links use relative `./` paths (e.g. `./theory/`, `./api/openapi-workflow.md`). Docusaurus resolves these at build time; broken links will only surface in the build log, not in this file.
