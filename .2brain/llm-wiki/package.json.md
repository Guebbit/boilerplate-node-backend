---
source: package.json
sha256: 54a0248ff78b466c2cf275e778fd6b97503896c29b76e35b73e6e34ad01a07e0
generated_at: 2026-10-29T01:20:41.431096+00:00
model: ollama:qwen3.8:27b
---

# package.json

## Purpose

Root manifest for **boilerplate-node-api-mongodb-mongoose** (v3.0.0). Declares the project's runtime and dev dependencies, and defines the full set of npm scripts that drive development, testing, linting, codegen, CI gates, container orchestration, and benchmarking for an Express 5 / Mongoose 9 REST + AsyncAPI service.

## Key elements

- **`main`** – `src/cluster.ts`; the process entry-point for production and most dev/start scripts.
- **`scripts.start`** – `node --import tsx src/cluster.ts`; production launch.
- **`scripts.dev` / `dev:docker` / `dev:docker:cluster`** – Watch-mode dev servers via `tsx watch` or `nodemon`, importing `scenarios/support/development-doubles.ts` to inject test doubles.
- **`scripts.e2e:serve`** – Starts the cluster with `NODE_E2E_RUN=1` for end-to-end tests.
- **`scripts.demo`** – Runs `scenarios/run-server.ts` with the same doubles import.
- **`scripts.postinstall`** – Runs four codegen steps in sequence: `gen:permission-actions`, `contracts:bundle`, `gen:api`, `gen:asyncapi`.
- **`scripts.prepare`** – Installs Husky git hooks.
- **`scripts.complete`** – Composite gate: `complete:static` → `docs:build` → full `test` suite.
- **`scripts.complete:static` / `complete:static:gates`** – Lint + Prettier + `ts-check` + OpenAPI/AsyncAPI Spectral lint + `check` (artifact regeneration, breaking-change detection, dependency-cruiser).
- **`scripts.check`** – Validates regenerated artifacts, AsyncAPI breaking changes, spec identity, doc references, and dependency-cruiser rules across `src`, `src/modules`, and the bootstrap script.
- **`scripts.test`** – Sequential suite: unit → cross-cutting → integration → contract → fuzz, all via `scripts/testing/run-suite.ts`.
- **`scripts.bench` / `bench:search`** – Autocannon load tests (20 clients, 30 s).
- **`scripts.bench:k6`** – Runs a k6 script inside a container (default engine: podman).
- **`scripts.compose*`** – Podman/Compose wrappers (`up`, `restart`, `rebuild`); full profile adds `observability`, `analytics`, `docs` services.
- **`scripts.gen:api`** – Deletes `./api`, regenerates via Orval, then generates error-codes, request-content-types, and permission-actions.
- **`scripts.host`** – Prefix helper that sets local `NODE_DB_URI`, `NODE_MONGODB_HOST`, `NODE_REDIS_*` and then delegates to `npm run <subcommand>`.
- **`dependencies`** – Express 5, Mongoose 9, MongoDB driver 7, Redis, AMQP (`amqplib`), OpenTelemetry SDK + instrumentations (Express, HTTP, Mongoose, Redis), CASL + Mongoose plugin, `sharp` (pinned 0.35.5), `jose`, `openid-client`, `puppeteer-core`, `winston`, `prom-client`, `posthog-node`, `tsx`, `dotenv`, `i18next`, `multer`, `helmet`, `express-rate-limit` + `rate-limit-redis`, `altcha-lib`, `bowser`, `nodemailer`, `csv-stringify`, `ibantools`, `ipaddr.js`, `otplib`, `cookie-parser`, `cors`, `ejs`, `sitemap`, `disposable-email-domains-js`, `@guebbit/js-toolkit`.
- **`devDependencies`** – TypeScript ~6.0, ESLint 10 + plugins (boundaries, jest, unicorn, jsdoc, eslint-comments), Prettier, Jest 30 + `@swc/jest` + `ts-jest`, Stryker mutation testing, Spectral (OpenAPI/AsyncAPI lint), `@asyncapi/parser` + `modelina` + `diff`, Orval, dependency-cruiser, Knip, jscpd, `mongodb-memory-server`, `supertest`, `fast-check`, `cross-env`, `nodemon`, VitePress + Mermaid, `@stoplight/prism-cli`, `@redocly/cli`, Husky + lint-staged + commitlint, autocannon, `@babel/plugin-transform-modules-commonjs`, `@types/*` for Express 5, cookie-parser, cors, ejs, multer, node 24, supertest, jest 30.

## Relationships

- **`src/infrastructure/runtime/otel-sdk.ts`** – Consumes the `@opentelemetry/*` packages (SDK, exporter, instrumentations, resources, semantic-conventions) declared under `dependencies`; `package.json` is the sole source of those version pins.
- **`tests/contract/password-set-paths.test.ts`** – Executed by the Jest run invoked through `scripts.test:contract` (`run-suite.ts contract`); the `NODE_SESSION_MODE=cookie` variant (`test:contract:cookie`) selects the cookie auth path this test exercises.
- **`scenarios/support/doubles/payments/levers.ts`** – Part of the `scenarios/support/` tree imported by every dev/demo/e2e script via `--import ./scenarios/support/development-doubles.ts`; its availability is a precondition for those scripts to run.

## Notes

- **`postinstall` is a codegen gate.** It runs `gen:permission-actions`, `contracts:bundle`, `gen:api`, and `gen:asyncapi` in sequence. A failed codegen step aborts `npm install`. CI or offline environments must account for this.
- **`sharp` is the only pinned version** in `dependencies` (exact `0.35.5`, no caret). All others use `^` or `~`.
- **`scripts.host` ends with `npm run` and no subcommand.** It is a prefix wrapper; you must append a script name (e.g. `npm run host dev`).
- **`scripts.bench` and `bench:k6`** rely on shell positional-arg expansion (`${1:-/products}`, `${1:-browse}.js`). They must be invoked through `sh`/`bash`, not directly as `node`.
- **`scripts.compose`** defaults the container engine to **podman** via `${CONTAINER_ENGINE:-podman}`; set `CONTAINER_ENGINE=docker` to override.
- **`scripts.gen:api` deletes `./api`** (`rm -rf`) before regenerating. Any local, uncommitted changes in that directory are lost.
- **TypeScript is pinned to `~6.0.0`** (tilde, not caret), and `@types/node` targets Node 24.
- The `complete:light` / `complete:light:gates` scripts provide a faster CI path (skips integration/contract/fuzz, docs build) for pre-commit or PR checks.
