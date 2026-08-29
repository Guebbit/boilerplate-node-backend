# docs/tools/tools-explained.md

## Purpose

A single-page, at-a-glance reference for every tool in the stack. For each tool it answers three questions — *what it is*, *what problem it solves*, and *what it does in this repo* — then links out to the dedicated deep-dive page. The goal is orientation, not depth.

## Key elements

- **Mermaid flowchart** — the full stack grouped by concern (Runtime, Data, Request edge, Contract, Testing, Telemetry) with colour-coded nodes and a directional note that Contract generates into Runtime, never the reverse.
- **Per-tool sections** (What / Problem / In-this-repo format):
  - **Core stack:** Node.js + TypeScript, Express 5, Zod, Helmet, JWT (jsonwebtoken + bcrypt), express-rate-limit
  - **Data layer:** MongoDB, Mongoose, Redis (response cache), RabbitMQ (async jobs)
  - **Outbound:** Nodemailer + EJS (email), Puppeteer / puppeteer-core (PDF)
- **Section links** — each tool block ends with a `→ [Page](./<page>.md)` pointer to the configuration/code-level detail page (e.g. `./runtime.md`, `./security.md`, `./mongodb-mongoose.md`, `./redis-cache.md`, `./rabbitmq.md`, `./email-and-rendering.md`).

## Relationships

- **`docs/tools/unit-testing.md`** — the Testing subgraph in this file's diagram (Jest, supertest, mongodb-memory-server, fast-check, Stryker, autocannon) is listed here only as a named group; `unit-testing.md` is the destination for setup, configuration, and workflow details.
- **`docs/tools/winston.md`** — Winston appears in the Telemetry subgraph of the Mermaid diagram. This file does not include a dedicated Winston section; `winston.md` holds the transport, format, and level configuration details.

## Notes

- The file is intentionally a **flat, single-page overview**. If a reader needs code pointers, middleware ordering, or config keys, they should follow the `→` link to the tool's dedicated page rather than expecting it here.
- The diagram carries a strong directional rule: **Contract (Orval/Spectral/Modelina/Prism) points into Runtime**, and `openapi.yaml` generates everything under `api/`. The page explicitly calls out "editing generated output" as the one mistake the diagram exists to prevent.
- Content is truncated in the source (the Puppeteer section is cut off); the full file may contain additional outbound or telemetry sections.
