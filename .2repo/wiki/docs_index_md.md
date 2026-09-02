# docs/index.md

## Purpose

Landing/home page of the Docusaurus documentation site for the `api-mongodb-mongoose` boilerplate. It orients readers (human or AI) to the repo's shape, its six documentation sections, and the key starting points — acting as a table of contents before any specific topic page is read.

## Key elements

- **Frontmatter (`layout: home`)** — Docusaurus hero config with five CTA buttons (Get Started, See the shop, Read Theory, Browse Modules, Explore Tools, Follow the API flow) and four `features` cards summarising the repo's differentiators.
- **"Read this repo as" block** — a labelled index mapping each concern (API, framework, DB, observability, real-time, process model, contracts, shape) to the page that explains it.
- **"Six sections, six jobs"** — one-paragraph descriptions of Demo Shop, Theory, Modules, Tools, API, and Files (reference) sections, each with a pointer to its index page.
- **Two Mermaid flowcharts** — a "family map" showing sibling boilerplates, and a "current repo" diagram tracing the request path from `openapi.yaml` / `asyncapi.yaml` through routes → controllers → services → repositories → models → MongoDB, with side channels (Redis, RabbitMQ, OpenTelemetry → Grafana).
- **"Good starting points"** — a bulleted list of entry-point recommendations keyed to the reader's situation (first run, production deploy, non-dev, module contract edit, file lookup, dependency lookup, observability, contract change).

## Relationships

- Links outward to every top-level section index: `getting-started.md`, `getting-started-production.md`, `theory/clustering.md`, `theory/layers.md`, `api/openapi-workflow.md`, `api/asyncapi-workflow.md`, `api/observability.md`, `api/regenerating.md`.
- Links to tool pages: `tools/mongodb-mongoose.md`, `tools/observability-reference.md`, `tools/opentelemetry.md`, `tools/grafana.md`, `tools/email-and-rendering.md`, `tools/package-dependencies.md`, `tools/package-scripts.md`.
- Serves as the `link` target for the hero's "Get Started", "Read Theory", "Browse Modules", "Explore Tools", and "Follow the API flow" buttons, making it the canonical `/` route of the docs site.
- All neighbor pages treat this file as the navigation root; the frontmatter `features` and "Good starting points" sections are the primary cross-linking surface into the rest of the tree.

## Notes

- The page is primarily **frontmatter + prose + diagrams**; it contains no executable logic. Changes to the hero actions or feature cards alter the rendered home page without touching any other file.
- The two Mermaid blocks use inline `classDef` styling; they are decorative orientation aids, not a machine-readable dependency graph.
- The "family map" references sibling repos (`mvc-mongodb-mongoose`, `api-mysql-sequelize`, etc.) that do **not** exist in this codebase — they are external projects in the same family. Do not expect corresponding files locally.
- The page links to `./tools/prometheus.md` and `./tools/tools-explained.md`, which are **not** in the dependency-graph neighbor list; verify those paths exist before relying on them.
