---
source: package.json
sha256: 19d9f547ef97ef38dd99a0200bc99c977b6011ee8e282d7d8f3adf39d2de1b38
generated_at: 2026-09-27T13:48:55.745459+00:00
model: ollama:qwen3.8:27b
---

# package.json

## Purpose

Project manifest for the `boilerplate-node-api-mongodb-mongoose` monorepo (v2.0.0, AGPL-3.0). It declares the runtime entry point (`src/cluster.ts`), all npm scripts (dev, test, lint, contracts, ops, docs, Docker), and the full dependency/dev-dependency tree. Every workflow in the project is invoked through the scripts defined here.

## Key elements

- **`main`: `"src/cluster.ts"`** — the process entry point for both dev and production.
- **`scripts`** — ~90 npm scripts grouped by concern:
  - *Run:* `dev`, `dev:docker`, `dev:docker:cluster`, `start`, `debug` (all via `tsx`).
  - *Test:* `test` (chained unit → cross-cutting → integration → contract → fuzz), `test:unit`, `test:cross-cutting`, `test:integration`, `test:contract`, `test:fuzz`, `test:order-random`, `test:cluster`, `test:prism`.
  - *Lint / contracts:* `ts-check`, `lint`, `lint:openapi`, `lint:openapi:modules`, `lint:asyncapi`, `lint:asyncapi:modules`, `prettier:check/fix`.
  - *Contract tooling:* `contracts:bundle`, `check:contracts-bundle`, `check:asyncapi-breaking`, `check:spec-identity`, `gen:api` (orval), `gen:asyncapi`.
  - *Docs:* `docs:graph`, `docs:roles`, `docs:dependencies`, `docs:rate-limits`, `docs:audit-actions`, plus `check:*` variants; VitePress `docs:dev/build/preview`.
  - *Ops / reaping:* `reap:quarantine`, `reap:invoices`, `reap:orders`, `reap:payments`, `sweep:*`, `refresh:breached-passwords`.
  - *DB / access:* `db:sync`, `db:bootstrap`, `access:bootstrap`, `access:grant`, `deploy:setup`.
  - *Docker / Compose:* `compose`, `compose:up`, `compose:up:full`, `compose:restart`, `compose:rebuild`, `compose:kill` (engine defaults to `podman`, overridable via `CONTAINER_ENGINE`).
  - *Benchmarking:* `bench`, `bench:search`, `bench:orders`, `bench:inventory` (autocannon); `bench:k6`, `bench:k6:checkout` (containerised k6).
  - *Mutation:* `mutation`, `mutation:full`, `mutation:check` (Stryker).
  - *CI gate:* `complete` — single script chaining every check and the full test suite; `complete:fix` and `complete:manual` are variants.
  - *Lifecycle:* `postinstall` (bundles contracts, generates API + AsyncAPI types), `prepare` (installs Husky hooks).
- **`dependencies`** — Express 5, Mongoose, AMQP (amqplib), OpenTelemetry SDK, CASL, bcrypt, helmet, express-rate-limit, i18next, EJS, altcha-lib, etc.
- **`devDependencies`** — TypeScript ~6, Jest 30, tsx/SWC, ESLint 10 + plugins (boundaries, unicorn, jsdoc, prettier), Stryker, autocannon, Spectral, Redocly, orval, AsyncAPI parser/diff, dependency-cruiser, Prettier, VitePress, nodemon, husky, mongodb-memory-server, supertest, fast-check, mermaid.

## Relationships

- **`scenarios/flows/loopback.ts`** — exercised by the `demo` script (`tsx scenarios/run-server.ts`) which loads scenario flows.
- **`src/app/demo.ts`, `src/app/error-handling.ts`, `src/app/request-context.ts`, `src/app/routes.ts`, `src/app/security.ts`, `src/app/static-assets.ts`, `src/app/telemetry.ts`** — application modules loaded at runtime by the `main` entry (`src/cluster.ts`); covered by `test:*` and `lint` scripts.
- **`src/infrastructure/adapters/image.ts`** — infrastructure module exercised by `scenario:images` and integration tests.
- **`src/infrastructure/runtime/server-lifecycle.ts`** — runtime boot code invoked by `dev`, `start`, `debug`, and `test:cluster`.
- **`tests/cross-cutting/contract-error-declarations.test.ts`**, **`tests/cross-cutting/replace-patch-parity.test.ts`** — run by `test:cross-cutting`.
- **`tests/support/spec-walk.ts`** — test helper used across contract and cross-cutting suites.

## Notes

- `postinstall` regenerates contract bundles and API types on every `npm install`; a stale `node_modules` can mask missing generated artifacts.
- `bench` scripts default to port 3000 but respect `NODE_PORT`; the `host` script clears DB/Redis env vars for local-first runs.
- The `complete` script is the single CI gate — it runs **every** check in sequence and fails fast on the first non-zero exit.
- `compose` scripts default to **podman** (`${CONTAINER_ENGINE:-podman}`); set `CONTAINER_ENGINE=docker` to override.
- `test:unit:coverage` forces `--max-old-space-size=4096` and `--runInBand` to avoid OOM on the full unit + cross-cutting shard.
- `gen:api` uses `rm -rf ./api` before running orval; running it concurrently with another process that reads `./api` will fail.
- `typescript` is pinned to `~6.0.0` (tilde), while most other dev deps use caret ranges.
