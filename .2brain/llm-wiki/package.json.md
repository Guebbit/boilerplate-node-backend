---
source: package.json
sha256: 33add309f4e055e8fff7bdd2dee7d43d37fed9168f68572001e74c6b77afe82b
generated_at: 2026-09-23T17:16:03.726528+00:00
model: ollama:qwen3.8:27b
---

# package.json

## Purpose

Root manifest for the **boilerplate-node-api-mongodb-mongoose** project (v2.0.0, AGPL-3.0). It declares the `src/cluster.ts` entry point, runtime and dev dependencies, and the full set of npm scripts that drive development, testing, contract validation, documentation generation, deployment, and benchmarking workflows. Every CI gate, local dev loop, and ops task is invoked through a script defined here.

## Key elements

- **`main`** — points to `src/cluster.ts`, the process entry that boots the Express app (cluster mode).
- **`scripts`** — ~90 named commands grouped by domain:
  - *Runtime*: `dev`, `dev:docker`, `start`, `debug`, `demo` (runs `scenarios/run-server.ts`).
  - *Quality gates*: `ts-check`, `lint`, `lint:openapi*`, `lint:asyncapi*`, `prettier:*`, `check:dependencies` (dependency-cruiser), `check:spec-identity`.
  - *Contracts*: `contracts:bundle`, `check:contracts-bundle`, `check:asyncapi-breaking`, `gen:api` (orval), `gen:asyncapi` (Modelina).
  - *Testing*: `test` (runs unit → cross-cutting → integration → contract → fuzz), `test:unit:coverage`, `test:order-random`, `test:cluster`, `mutation*` (Stryker), `test:prism`.
  - *Docs*: `docs:*` (VitePress), `check:docs-*` (generated artifact verification).
  - *Ops / DB*: `db:sync`, `db:bootstrap`, `access:*`, `reap:*`, `sweep:*`, `compose*` (podman/docker).
  - *Benchmarking*: `bench`, `bench:search`, `bench:orders`, `bench:inventory`, `bench:k6*`.
  - *Aggregate*: `complete` / `complete:fix` chain every gate above in sequence; `complete:manual` adds Prism + cluster tests.
- **`dependencies`** — runtime libs: Express 5, Mongoose (implied), i18next, helmet, express-rate-limit, OpenTelemetry SDK + instrumentations, amqplib, bcrypt, jsonwebtoken, CASL (RBAC), dotenv, ejs, altcha-lib, etc.
- **`devDependencies`** — TypeScript 5, Jest 30 (+ SWC transform), ESLint 9 + plugins, Prettier, Spectral, Stryker, dependency-cruiser, orval, VitePress, mongodb-memory-server, fast-check (fuzz), Husky, npm-check-updates, autocannon, k6.
- **`postinstall`** — automatically runs `contracts:bundle`, `gen:api`, and `gen:asyncapi` after `npm install`.
- **`prepare`** — installs Husky git hooks.

## Relationships

- **src/app/\* (`routes.ts`, `security.ts`, `telemetry.ts`, `request-context.ts`, `error-handling.ts`, `static-assets.ts`, `demo.ts`)** — all launched indirectly: `start`/`dev` execute `src/cluster.ts` which imports these modules; `demo` runs `scenarios/run-server.ts` which wires them in test mode. The OpenTelemetry runtime deps power `telemetry.ts`; `helmet`, `express-rate-limit`, `cookie-parser` back `security.ts`.
- **scenarios/flows/loopback.ts** — consumed by the `demo` and `scenario:apply` scripts for end-to-end flow execution against a running instance.
- **src/infrastructure/adapters/image.ts** — exercised by `scenario:images` (seed-image generation) and covered by unit/integration suites run via `test:unit` / `test:integration`.
- **tests/cross-cutting/contract-error-declarations.test.ts** — part of the `test:cross-cutting` suite (invoked by the aggregate `test` script and `test:unit:coverage`).
- **tests/support/spec-walk.ts** — helper used by the Jest suites above to enumerate spec fixtures; pulled in via the same `tsx scripts/testing/run-suite.ts` orchestrator.

## Notes

- `postinstall` **and** `prepare` both run on `npm install`; `postinstall` requires network-free codegen (orval, Modelina) to succeed, so offline installs will fail unless generated artifacts are committed.
- The `complete` script is the canonical CI gate — it runs **every** check sequentially; any single failure aborts the chain. Use `complete:fix` for an auto-fix pass first.
- `dev:docker` uses `nodemon --legacy-watch` (required for inotify limits inside containers) and runs `src/app.ts`, **not** `src/cluster.ts`; `dev:docker:cluster` is the cluster variant.
- `bench` scripts default to port `3000` via `${NODE_PORT:-3000}`; override with the `NODE_PORT` env var.
- Container engine is abstracted behind `${CONTAINER_ENGINE:-podman}` — set `CONTAINER_ENGINE=docker` to switch.
- `host` script is a `cross-env` prefix, not a standalone command; it must be followed by another npm script (e.g., `npm run host start`).
- The project uses **Express 5** (not v4) — middleware signatures and async error handling differ from most existing examples.
