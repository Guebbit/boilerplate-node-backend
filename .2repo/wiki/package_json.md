# package.json

## Purpose

Project manifest for **boilerplate-node-api-mongodb-mongoose** v2.0.0 — an Express 5 + Mongoose 9 REST/async API. It declares runtime dependencies, dev tooling, npm scripts (dev, test, lint, codegen, DB, benchmarking), and lifecycle hooks. Entry point is `src/cluster.ts`; license is AGPL-3.0.

## Key elements

- **`main`** — `src/cluster.ts`; the cluster-bootstrap entry for `npm start`.
- **`scripts`** — organized by concern:
  - *Dev/runtime:* `dev`, `dev:docker`, `dev:docker:cluster`, `start`, `debug`, `host`
  - *Type-check & lint:* `ts-check`, `lint`, `lint:openapi[:modules]`, `lint:asyncapi[:modules]`, `prettier:check|fix`, `check:dependencies` (dependency-cruiser)
  - *Codegen / contracts:* `postinstall` runs `contracts:bundle`, `gen:api` (orval → `./api`), `gen:asyncapi` (modelina → `src/types/asyncapi.generated.ts`); `check:contracts-bundle`, `check:spec-identity`
  - *Test tiers:* `test` chains `test:unit` → `test:cross-cutting` → `test:integration` → `test:contract` → `test:fuzz`; plus `test:mutation` (Stryker), `test:prism`, `test:cluster`
  - *DB:* `db:migrate:up|down|status`, `db:seed`, `db:seed:reset`, `db:cache:clear`, `db:bootstrap`
  - *Infra:* `compose[:restart|:rebuild|:kill]` (podman/docker compose), `setup:mongod`
  - *Bench:* `bench`, `bench:search`, `bench:orders`, `bench:inventory`, `bench:k6[:checkout]`
  - *Docs:* `docs:dev|build|preview` (VitePress), `docs:asyncapi` (AsyncAPI Studio)
  - *Housekeeping:* `complete` (full gate), `complete:fix`, `complete:manual`, `update:all`, `prepare` → `husky`
- **`dependencies`** — Express 5, Mongoose 9, Redis, AMQP, OpenTelemetry (OTLP HTTP, express/http/mongoose/redis instrumentations), JWT, Zod, Winston, i18next, Multer, Puppeteer-core, PostHog, prom-client, `@guebbit/js-toolkit` & `openapi-runnable-collections`.
- **`devDependencies`** — TypeScript 5.9, tsx, Jest 30 (+ @swc/jest, ts-jest), ESLint 9 (boundaries, unicorn, prettier, import-resolver-typescript), Spectral, Prism CLI, orval, Stryker, dependency-cruiser, VitePress, k6/autocannon, mongodb-memory-server, migrate-mongo, Husky, commitlint.
- **`overrides`** — pins `ip-address` ≥ 10.5.0 (transitive dep fix).
- **Lifecycle hooks** — `postinstall` auto-generates contract bundles + API/AsyncAPI types on every `npm install`; `prepare` installs Husky git hooks.

## Relationships

- **`src/cluster.ts`** — declared as `main`; invoked by `dev`, `start`, `debug`, `dev:docker:cluster`. All `src/app/*` modules (routes, security, telemetry, static-assets, request-context, error-handling, demo) are loaded transitively through this entry.
- **`tests/cross-cutting/contract-error-declarations.test.ts`** — executed by the `test:cross-cutting` script (`jest tests/cross-cutting`); part of the full `test` gate.
- **`tests/support/spec-walk.ts`** — test utility consumed by cross-cutting and contract test suites run under `test:cross-cutting` / `test:contract`.
- **`src/app/demo.ts`** — part of the app graph reachable from the `main` entry; the `demo` script (`tsx scripts/run-demo-server.ts`) exercises demo-related routes.
- **`src/app/error-handling.ts`, `request-context.ts`, `routes.ts`, `security.ts`, `static-assets.ts`, `telemetry.ts`** — application modules wired together under the `src/cluster.ts` → `src/app.ts` boot path exercised by `dev`/`start`/`test:integration`/`test:contract`.

## Notes

- `postinstall` is the de-facto codegen step: running `npm install` (or `npm ci`) will regenerate `./api` and `src/types/asyncapi.generated.ts`. CI or fresh clones should expect these directories to appear without a manual script call.
- The `host` script is a **prefix** that sets local env vars and delegates (`npm run …`); it is not self-executing.
- `test` script runs five Jest tiers sequentially; each tier after unit runs with `--runInBand`. Running a single module's tests uses `test:module` (`jest --runInBand` in that directory).
- `build` is only `ts-check && lint` — there is no bundling/transpilation step; the project ships as TypeScript run via `tsx`.
- `overrides` for `ip-address` is a transitive pin; upgrading or removing it may change `express-rate-limit` behavior.
- The project uses both `podman` and `docker` via the `CONTAINER_ENGINE` env var (default `podman`) in the `compose` script.
