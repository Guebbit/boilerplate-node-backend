# README.md

## Purpose

Entry-point document for the `boilerplate-node-api-mongodb-mongoose` repository. It gives a new developer (or AI assistant) the minimum context needed to clone, boot, and orient within the project before diving into `docs/` or `src/`. It deliberately defers detailed reference material to the linked documentation set.

## Key elements

- **Tagline & pairing note** — Identifies the stack (Express 5, TypeScript, Mongoose) and its companion frontend repo.
- **Image-store warning block** — Flags that `imageStore` writes to the container filesystem; uploads are lost on rebuild/redeploy and are not shared across replicas. Notes that a durable `ImageStore` (S3/CDN) is not yet implemented.
- **Quick-start block** — `npm install`, env copy, `npm run compose:restart`; explains the `db:bootstrap` hook and provides two `curl` smoke-test commands.
- **Compoze-script warning** — Instructs to use `npm run compose:*` rather than bare `compose up` so the Promtail override (`-f`) is passed and Loki/Grafana receive logs.
- **Architecture flowchart (Mermaid)** — Request → kernel middlewares → controller → service → repository → MongoDB, with side paths to Redis, domain events, and OpenTelemetry.
- **Four design principles** — Module-as-value, contract-as-output (`openapi.yaml`), honest layering, observability-wired.
- **Directory map table** — One-line description of `src/modules/*`, `src/kernel`, `src/infrastructure`, `src/app`, `api/`, `shared/`, `db/`.
- **"The map" navigation table** — Routes each task (run, read, add module, change endpoint, test, deploy) to a specific `docs/` page or config file.
- **Pre-commit gate** — `npm run complete` (build + tests + lint + format) and the optional `complete:fix`, `test:prism`, `test:mutation`, `test:fuzz`, `bench` scripts.
- **License** — AGPL-3.0.

## Relationships

- **CHANGELOG.md** — Sibling top-level document. The README is the stable "what this is and how to start" surface; CHANGELOG.md records per-version changes. The README does not link to or import CHANGELOG.md; their interaction is purely organizational (both live at the repo root and are read in that order by convention).

## Notes

- The README explicitly states it is "only the door" — the `docs/` tree (especially `docs/reference/` File Glossary) is the authoritative reference. Do not treat README claims as a complete API or module listing.
- The `api/` directory is generated output; the README warns it must never be hand-edited.
- The image-store limitation is called out with a `::: danger` admonition, not a code comment; it is easy to miss when scanning quickly.
- The pre-commit hook runs exactly `npm run complete`; running bare `npm test` or a single lint pass will not satisfy the gate.
