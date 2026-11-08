---
source: package.json
sha256: e083a2f403aabb395de16be032851260049e9d6e94f06d0ce1436a4eeb5589bf
generated_at: 2026-11-08T02:26:40.752887+00:00
model: ollama:qwen3.8:27b
---

# package.json

## Purpose

Root manifest for the `boilerplate-node-api-mongodb-mongoose` project (v3.0.0, AGPL-3.0-or-later). It declares all runtime and dev dependencies, defines the full script surface (dev, test, lint, generate, deploy, benchmark), and wires the `postinstall` hook that regenerates API types, AsyncAPI types, and the permission vocabulary on every install. The entry point is `src/cluster.ts`.

## Key elements

- **`scripts`** — ~80 named tasks grouped by concern:
  - *Dev/runtime*: `dev`, `dev:docker`, `start`, `e2e:serve`, `demo`, `debug`. All launch via `tsx` (TypeScript runtime); `dev` uses `tsx watch` plus the `development-doubles` import for in-memory substitutes.
  - *Quality gates*: `lint`, `ts-check`, `prettier:*`, `lint:openapi*`, `lint:asyncapi*`, `check` (runs artifact freshness, breaking-change detection, dependency-cruiser boundaries).
  - *Codegen*: `gen:api` (orval → `api/` dir + generated error/content-type/upload/redirect modules + permission vocabulary), `gen:asyncapi` (Modelina → `src/types/asyncapi.generated.ts`), `contracts:bundle`.
  - *Testing*: `test` (unit → cross-cutting → integration → contract → fuzz), `test:unit`, `test:contract`, `test:cluster`, `test:broker`, `test:prism`, `mutation` (Stryker diff/shards), `bench` / `bench:search` / `bench:k6`.
  - *Infra/ops*: `compose*` (defaults to `podman`), `db:*`, `deploy:*`, `backup:drill`, `config:check`, `reencrypt`, `refresh:breached-passwords`.
  - *Docs*: `docs:dev` / `docs:build` / `docs:preview` (VitePress).
  - *Aggregates*: `complete` = static gates + docs build + full test suite; `complete:light` = lint + gates + unit/cross-cutting only; `complete:manual` = Prism + cluster + broker.
- **`postinstall`** — regenerates scenario registries, authorization bundle, permission vocabulary, shared rule schemas, contract bundles, orval API client, and AsyncAPI types. New contributors must let this finish before the project is usable.
- **`dependencies`** — Express 5, Mongoose, Redis, `amqplib` (RabbitMQ), full OpenTelemetry SDK stack (OTLP-HTTP, Express/HTTP/Mongoose/Redis instrumentations), `@casl/ability` + `@casl/mongoose` (RBAC), `express-rate-limit`, `altcha-lib`, `cookie-parser`, `cors`, `helmet`, `dotenv`, `ejs`, `csv-stringify`, `bowser`, `disposable-email-domains-js`, `multer`.
- **`devDependencies`** — TypeScript ~6.0, tsx/SWC, Jest 30 (+ `@swc/jest`), Stryker mutator, Stryker jest runner, ESLint 10 (+ boundaries, jest, unicorn, jsdoc plugins), Prettier, Spectral CLI, orval, Modelina, AsyncAPI parser/diff, dependency-cruiser, knip, jscpd, mongodb-memory-server, supertest, autocannon, VitePress + Mermaid plugin, Husky, commitlint, cross-env, nodemon.

## Relationships

- **`src/app.ts`** — the application factory that `src/cluster.ts` (the declared `main`) bootstraps; package.json scripts that run the server (`dev`, `start`, `e2e:serve`, `debug`) all ultimately execute through this file.
- **`src/app/telemetry.ts`** & **`src/infrastructure/runtime/otel-sdk.ts`** — consume the OpenTelemetry packages listed in `dependencies`; `otel-sdk.test.ts` exercises the SDK configuration.
- **`src/app/security.ts`**, **`src/app/error-handling.ts`**, **`src/app/request-context.ts`**, **`src/app/routes.ts`**, **`src/app/static-assets.ts`** — middleware/route layers that rely on Express, `cookie-parser`, `cors`, `helmet`, `express-rate-limit`, and `ejs` as declared here.
- **`src/infrastructure/adapters/image.ts`** — image-handling adapter; covered by scenario tooling (`scenario:images`).
- **`src/modules/account/session/device-label.ts`** — session/device module; exercised by contract and journey tests under the `test:contract:cookie` / `test:journeys:cookie` scripts.
- **`scenarios/support/demo.ts`**, **`scenarios/support/doubles/payments/levers.ts`** — in-memory payment doubles and demo helpers loaded via the `--import ./scenarios/support/development-doubles.ts` flag in dev/demo scripts.
- **`scenarios/flows/loopback.ts`** — loopback test scenario run under the contract/fuzz test suites.
- **`src/infrastructure/runtime/server-lifecycle.ts`** — graceful shutdown / cluster lifecycle; invoked by `start` and `dev` through `src/cluster.ts`.

## Notes

- **`postinstall` is mandatory**: the `api/` directory, `src/types/asyncapi.generated.ts`, and permission-vocabulary modules are generated, not committed. A bare `npm install` that skips postinstall will leave type imports dangling.
- **`tsx` everywhere, not `ts-node`**: all scripts invoke `tsx` (or `node --import tsx`). Do not add `ts-node` as a substitute.
- **Container engine is podman by default** (`${CONTAINER_ENGINE:-podman}`); override with `CONTAINER_ENGINE=docker` if needed.
- **`dev:docker` uses `nodemon` + `--legacy-watch`** to sidestep inotify limits inside containers; the plain `dev` script does not.
- **`host` script is a prefix, not a command**: `npm run host -- <script>` injects localhost DB/Redis env vars and then delegates. Calling it bare does nothing useful.
- **`complete` vs `complete:light` vs `complete:manual`**: CI presumably runs the full chain; `complete:manual` (Prism, cluster, broker) requires live infrastructure and is excluded from the automated path.
- **Mutation testing is diff-based by default** (`mutation`); use `mutation:full` for a baseline sweep.
- **`bench` / `bench:search` / `bench:k6`** require the server to already be listening on `NODE_PORT` (default 3000); they do not start it.
