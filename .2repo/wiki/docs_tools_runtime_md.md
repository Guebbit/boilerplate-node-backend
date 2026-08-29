# docs/tools/runtime.md

## Purpose

Catalogs the project's runtime stack (Node.js, Express 5, Zod, Multer, i18next, dotenv, TypeScript, tsx) with a one-line justification for each, a request-pipeline flowchart, and the architectural layering conventions that govern how those pieces interact. It exists as a single reference point so readers don't have to infer the tech stack from `package.json` alone.

## Key elements

- **Runtime tools table** — maps each dependency to its repo role (e.g. Express as REST transport assembled in `src/app.ts`, Zod for validation, Multer for uploads via `src/infrastructure/adapters/storage.ts`, i18next for locales merged at boot).
- **Runtime visual (Mermaid flowchart)** — depicts the happy-path request flow: Express → Routes → Controllers → Services → REST responses, with Zod validation branching off Services.
- **"How to think about runtime" list** — four layering rules: Express owns HTTP plumbing, controllers stay thin, services do the work, validation stays close to business intent.
- **External references** — links to the Node.js cluster API (used in `src/cluster.ts`) and Zod schema basics.
- **Related pages** — cross-links to Layers, Clustering & Shutdown, Security, API overview, and Email & PDF rendering.

## Relationships

- **`src/app.ts`** — the file this page documents as the assembly point for the Express pipeline; the table and flowchart both reference it as where routes/controllers are wired together.
- **`docs/tools/security.md`** — linked under "Related pages"; covers security concerns that layer on top of the Express/Zod runtime described here.
- **`docs/tools/rabbitmq.md`** — sibling tools page in the same directory; covers a messaging component that sits alongside (but outside) the HTTP runtime pipeline documented here.

## Notes

- Node.js ≥ 22 is the minimum; the page notes `tsx` is used as the dev runner so no build step is required for `dev`/`start` scripts.
- The i18next entry specifies that `src/locales/` is merged with each module's `locales/` at boot — non-obvious because locale files live in multiple locations.
- The flowchart is intentionally simplified (no middleware, no clustering); see the linked Clustering & Shutdown page for the full process model.
