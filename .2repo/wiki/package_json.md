# package.json

## Purpose

Root manifest for the `boilerplate-node-api-mongodb-mongoose` project (v2.0.0, AGPL-3.0). It declares the dependency set (runtime + dev), defines the full script surface (dev, test, lint, docs, DB, benchmarking, code-gen), and wires lifecycle hooks (`postinstall`, `prepare`) that regenerate API contracts and install git hooks on every install.

## Key elements

- **`main`: `src/cluster.ts`** — declared entry point; all `dev`, `start`, and `debug` scripts target this (or `src/app.ts` for the single-process Docker variant).
- **`scripts.dev*`** — `dev` (tsx watch), `dev:docker` / `dev:docker:cluster` (nodemon + tsx) for hot-reload during development.
- **`scripts.test*`** — layered Jest suites: `unit`, `cross-cutting`, `integration`, `contract`, `fuzz`; plus Stryker mutation testing and Prism smoke tests. `test` chains them sequentially.
- **`scripts.lint*`** — ESLint (zero-warning), Prettier, Spectral for OpenAPI & AsyncAPI specs (global + per-module), and `dependency-cruiser` for import-graph rules.
- **`scripts.check*`** — `ts-check` (tsc --noEmit), `check:contracts-bundle`, `check:seed-export`, `check:spec-identity`, `check:dependencies`, `check:docs-graph`.
- **`scripts.gen*` / `scripts.contracts*`** — Orval (OpenAPI → TS client), AsyncAPI Modelina (→ TS types), and a contract-bundle build step.
- **`scripts.db*`** — `migrate-mongo` up/down/status, demo seeding, cache clearing, and a combined `db:bootstrap`.
- **`scripts.compose*`** — thin wrappers around `${CONTAINER_ENGINE:-podman} compose` (up/down/rebuild/kill).
- **`scripts.bench*`** — autocannon (products, search, orders, inventory) and k6 (browse, checkout) load-test invocations.
- **`scripts.docs*`** — Vitepress dev/build/preview for the `docs/` directory; AsyncAPI Studio for interactive spec browsing.
- **`scripts.complete`** — meta-script that runs every check, lint, doc build, and test in sequence (CI gate).
- **`postinstall`** — auto-runs `contracts:bundle`, `gen:api`, `gen:asyncapi` so generated artifacts exist before first use.
- **`prepare`** — installs Husky git hooks.
- **`dependencies`** — Express 5, Mongoose 9, Redis, AMQP (amqplib), OpenTelemetry (SDK + Express/HTTP/Mongoose/Redis instrumentations), Zod 4, Sharp, Puppeteer-core, i18next, Winston, PostHog, prom-client, and a handful of private `@guebbit/*` packages.
- **`devDependencies`** — Jest 30 + ts-jest + @swc, Stryker 9, ESLint 9 + boundaries/unicorn plugins, Spectral, dependency-cruiser, Orval, migrate-mongo, mongodb-memory-server, Vitepress, and type packages for every runtime dep.
- **`overrides`** — pins transitive `ip-address` to `^10.5.0`.

## Relationships

- **`src/app/routes.ts`, `security.ts`, `request-context.ts`, `demo.ts`, `error-handling.ts`, `static-assets.ts`, `telemetry.ts`** — all live under `src/` and are therefore covered by `ts-check`, `lint`, and the unit/integration test globs. `telemetry.ts` consumes the OpenTelemetry `dependencies`; `security.ts` consumes helmet, express-rate-limit, rate-limit-redis, bcrypt, jsonwebtoken; `static-assets.ts` and `routes.ts` consume ejs/express/multer.
- **`src/infrastructure/adapters/image.ts`** — depends on the `sharp` and `puppeteer-core` runtime packages declared here; exercised by the `backfill:image-thumbnails` script.
- **`tests/cross-cutting/contract-error-declarations.test.ts`** — executed by the `test:cross-cutting` script; likely uses `jest-openapi` and `zod` (both declared here) to assert error contract conformance.
- **`tests/support/spec-walk.ts`** — a shared test helper imported by cross-cutting/contract tests; runs under the same Jest invocation defined by `test:cross-cutting`.

## Notes

- The `host` script is a **prefix-only** helper (`cross-env … npm run`); it sets local env vars and expects an additional script name as its trailing argument. It will fail if invoked standalone.
- `postinstall` regenerates artifacts (`gen:api` does `rm -rf ./api` first). A clean install therefore always rebuilds the API client and AsyncAPI types — do not commit generated output expecting it to survive a fresh `npm ci`.
- `dev:docker` and `dev:docker:cluster` use `--legacy-watch` (inotify fallback) because they target inotify-limited Docker bind mounts; the plain `dev` script does not.
- The `complete` script is the canonical CI gate; `complete:manual` isolates the two tests that require a running cluster/Prism and must be run against a live environment.
- `lint` enforces `--max-warnings 0`, so any ESLint warning breaks the build.
- The `overrides` block exists to pin a single transitive dependency (`ip-address`); adding a new override should be treated as a conscious, reviewed decision.
