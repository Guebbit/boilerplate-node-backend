# README.md

## Purpose

Landing page and orientation guide for the `boilerplate-node-api-mongodb-mongoose` repo. It provides a 30-second quick-start, a one-diagram architecture sketch, a file-layout table, and a link map into `docs/`. It is explicitly **not** the reference; the docs tree is. Its job is to get a reader from "I cloned this" to "I know which doc to open" without re-reading the codebase.

## Key elements

- **Quick-start block** — `npm install` → `cp .env-example .env` → `npm run compose:restart`; the `app` container self-bootstraps DB migrations/seeds on first boot.
- **Mermaid flowchart** — request → kernel middlewares → module controller → service → repository → MongoDB, with side channels to Redis, domain events, and OpenTelemetry.
- **Four design invariants** — modules-as-typed-values, contract-as-generated-output (`openapi.yaml` → `api/`), strict layer isolation, observability wired at boot.
- **File-layout table** — maps `src/modules/*`, `src/kernel`, `src/infrastructure`, `src/app`, `api/`, `shared/`, `db/` to their roles.
- **Navigation map** — "You want X → read Y" table linking every task (run, read, add module, change endpoint, test, deploy) to a specific doc.
- **Pre-commit gate** — `npm run complete` (build + tests + lint + format, ~90 s); plus opt-in suites (`complete:manual`, `test:mutation`, `test:fuzz`, `bench`).
- **Image-store durability warning** — uploads live on the container filesystem; only `public/images/seed/` survives a rebuild; no S3/CDN backend is selected yet by design.

## Relationships

The README is the sole entry point that links outward to **all thirteen** graph neighbors; it is the hub in this documentation cluster:

- **Getting-started docs** (`getting-started.md`, `getting-started-production.md`) — linked from the quick-start and the navigation map as the "run it" references.
- **Theory docs** (`architecture.md`, `layers.md`, `modules.md`, `module-lifecycle.md`, `reading-path.md`) — linked as the "understand the shape" references; `reading-path.md` is flagged as the first-time code-reading entry.
- **API workflow docs** (`openapi-workflow.md`, `regenerating.md`) — linked for the "change an endpoint" task.
- **Tools docs** (`pairing-and-ports.md`, `package-scripts.md`, `tools-explained.md`, `testing-and-docs.md`) — linked for pairing, script lookup, dependency context, and test details respectively.

No neighbor links *back* into the README; the relationship is strictly outward.

## Notes

- **Use the npm scripts, not bare `docker compose up`.** The scripts inject a Promtail override via `-f`; skipping them leaves Loki empty and Grafana log panels blank with no visible error.
- `api/` is **generated** from `openapi.yaml` + module fragments; editing it by hand will be overwritten on the next `openapi:generate`.
- The `::: danger` block about image durability is a callout in VitePress admonition syntax — it renders only in the served docs, not as raw Markdown in a plain viewer.
- License is AGPL-3.0; the README itself is the first thing a contributor sees before that clause becomes relevant.
