---
source: package.json
source_sha256: fbb169bb20c43ae32e0f61183fb8bf8153271179fd733530db4fbaa8594685be
context_sha256: e684ad81fc2f55b9ffe14442ffd5fafe2d207009a0d445860d934823358d8284
generated_at: 2026-11-22T01:40:57.302955+00:00
model: claude-code:claude-sonnet-5-5
---

# package.json

## Purpose
npm manifest for `boilerplate-node-api-mongodb-mongoose` (v3.0.0, AGPL-3.0-or-later). It declares the entry point (`src/main.ts`), the dependency set, and a large catalogue of npm scripts that drive development, code generation, contract linting, testing, mutation testing, auditing, database/ops tasks, containers, and docs. TypeScript is run directly through `tsx`; there is no build step visible for `start` (`node --import tsx src/main.ts`).

## Key elements
- **Run scripts**
  - `dev` / `dev:docker` run the API with watch mode (`tsx watch` or `nodemon --legacy-watch`).
  - `dev:worker`, `dev:worker:heavy` and `dev:worker:docker` run `src/worker.ts`. The heavy variant sets `NODE_WORKER_ROLE=heavy` and `NODE_WORKER_PORT=3011`.
  - `start` and `debug` run `src/main.ts`.
  - `e2e:serve`, `e2e:worker` and `e2e:worker:heavy` set `NODE_E2E_RUN=1`.
  - `demo` runs `scenarios/run-server.ts`.
  - `host` is a `cross-env` wrapper that clears `NODE_DB_URI` and `NODE_REDIS_URL` and points Mongo and Redis at 127.0.0.1, then runs another npm script.
- **Quality gates**
  - `ts-check`, `lint` (`--max-warnings 0`), and `prettier:check` / `prettier:fix`.
  - OpenAPI and AsyncAPI linting: `lint:openapi*` and `lint:asyncapi*` (Spectral plus a custom validator).
  - `check` runs a generated-artifacts freshness check, an AsyncAPI breaking-change check, pairing spec identity, doc reference checks, and three `depcruise` passes (`src/tests`, `src/modules`, and the contracts bundle script).
- **Aggregates**
  - `complete`, `complete:static`, `complete:static:gates`, `complete:fix`, `complete:light:*` and `complete:manual` chain the gates together.
  - `test` runs unit, cross-cutting, integration, contract and fuzz suites in sequence.
- **Generation**
  - `postinstall` regenerates scenario registries, the authorization bundle, the permission vocabulary, shared rule schemas, contract bundles, the API client (`gen:api`, via orval plus generated error-code, content-type, upload and redirect-query files), and the AsyncAPI types (`gen:asyncapi`).
  - `regenerate` and `check:generated` also handle generated artifacts.
- **Testing**
  - Suites run through `scripts/testing/run-suite.ts` (`unit`, `cross-cutting`, `integration`, `contract`, `fuzz`).
  - Variants include cookie-session mode (`NODE_SESSION_MODE=cookie`), `test:prism`, `test:replicas`, `test:broker`, `test:staged`, and `test:order-random`.
  - `mutation*` scripts use Stryker. `bench` and `bench:k6` run k6 in a container.
- **Audits**
  - `audit:shallow`, `audit:unused` (knip), `audit:duplicates` (jscpd), `audit:check-clean`, and `audit:test-candidates`.
- **Data and ops**
  - `db:sync`, `db:bootstrap`, `db:cache:clear`, `access:bootstrap`, `deploy:setup`, `config:check`, `job`, `reencrypt`, `ops:reapply-erasures`, and `refresh:breached-passwords`.
  - `scenario:*` scripts seed and reset demo data and generate seed images and webhook-sink TLS material.
- **Scaffolding and pairing**
  - `scaffold:module`, `measure:scaffold`, `demo:remove`, and `sync:frontend`.
- **Containers, k8s and docs**
  - `compose*` wraps `${CONTAINER_ENGINE:-podman} compose`.
  - `backup:drill`, `deploy:drill` and `k8s:rig` run shell scripts.
  - `docs:dev`, `docs:build` and `docs:preview` use VitePress.
- **Hooks**
  - `prepare` runs `husky`. Commitlint, lint-staged and husky are in devDependencies.
- **Dependencies**
  - Visible runtime dependencies include CASL (`@casl/ability`, `@casl/mongoose`), `@guebbit/js-toolkit`, and OpenTelemetry packages (api, core, OTLP HTTP trace exporter, and express/http/mongoose/redis instrumentations). The list is cut off in the provided content.
  - devDependencies cover Jest 30 with SWC/ts-jest, Stryker, fast-check, supertest, mongodb-memory-server, Spectral, Redocly, Prism, AsyncAPI tooling, orval, dependency-cruiser, knip, ESLint 10 with plugins, Prettier, and TypeScript ~6.0.

## Relationships
- The OpenTelemetry dependencies match the telemetry and runtime files in the graph: `src/app/telemetry.ts`, `src/infrastructure/runtime/otel-sdk.ts` and `tests/unit/infrastructure/runtime/otel-sdk.test.ts`.
- The express/http/mongoose/redis instrumentation packages relate to the app layer (`src/app.ts`, `src/app/routes.ts`, `src/app/request-context.ts`, `src/app/error-handling.ts`, `src/app/security.ts`, `src/app/static-assets.ts`) and to `src/infrastructure/runtime/server-lifecycle.ts`.
- The `demo`, `scenario:*` and `e2e:*` scripts relate to the `scenarios/` files (`scenarios/flows/loopback.ts`, `scenarios/support/demo.ts`, `scenarios/support/doubles/payments/levers.ts`).
- The run scripts and `main` point at application entry files, which are not among the graph neighbors listed here. The neighbor files are tied to the manifest only through its dependencies and the scenario and test scripts.

## Notes
- `npm install` triggers a heavy `postinstall` that regenerates contracts, the API client and AsyncAPI types, so those generated outputs (the `api.generated/` directory and the AsyncAPI types produced by `gen:asyncapi`) are produced on install. `gen:api` begins with `rm -rf ./api.generated`.
- Container scripts default to Podman and can be overridden with `CONTAINER_ENGINE`.
- `lint` fails on any warning (`--max-warnings 0`).
- The `host` script is a prefix: it runs the next npm script with local-host env overrides (for example `npm run host dev`).
