# package.json

## Purpose

Project manifest for **boilerplate-node-api-mongodb-mongoose** (v2.0.0, AGPLv3.0). Declares the runtime and development dependency sets, defines the full script surface (dev server, linting, contract validation, multi-tier testing, benchmarking, DB migration/seeding, container orchestration, docs, and generated-artifact regeneration), and sets the entry point to `src/cluster.ts`. The `postinstall` hook auto-generates API and AsyncAPI client types and bundles OpenAPI/AsyncAPI contract files after every `npm install`.

## Key elements

- **`main`: `src/cluster.ts`** — entry point for both `start` and `dev` scripts (run via `tsx`).
- **`scripts.dev` / `scripts.start`** — launch the cluster mode server with `tsx`; `dev:docker` variants use `nodemon` + `tsx` for in-container watch.
- **`scripts.test`** — sequential gate: unit → cross-cutting → integration → contract → fuzz (all Jest).
- **`scripts.test:mutation`** — Stryker mutation testing with baseline-check and deep-config variants.
- **`scripts.lint` / `lint:openapi` / `lint:asyncapi`** — ESLint (zero-warnings), Spectral for OpenAPI/AsyncAPI specs, including per-module spec directories.
- **`scripts.postinstall`** — runs `contracts:bundle`, `gen:api` (Orval), and `gen:asyncapi` (custom script) to produce typed clients and bundled specs.
- **`scripts.prepare`** — initializes Husky git hooks.
- **`scripts.compose`** — wraps `podman compose` (or `docker compose` via `CONTAINER_ENGINE`).
- **`scripts.db:*`** — `migrate-mongo` up/down/status, seed via `db/demo/index.ts`, cache-clear, bootstrap (migrate + seed).
- **`scripts.bench*`** — AutoCannon and k6 load tests against `/products`, `/products/search`, `/orders`, `/inventory/levels`.
- **`scripts.complete`** — full CI gate: type-check → lint → spec lint → prettier → contract/seed/spec checks → dependency-cruiser → docs build → all tests.
- **`dependencies`** — Express 5, Mongoose 9, Redis, AMQP, OpenTelemetry suite, helmet, rate-limit-redis, zod, sharp, winston, i18next, jsonwebtoken, bcrypt, nodemailer, posthog-node, prom-client, puppeteer-core, tsx.
- **`devDependencies`** — Jest 30, TypeScript 5.9, ESLint 9 + typescript-eslint, Prettier, Spectral, AsyncAPI CLI, Stryker, Orval, dependency-cruiser, VitePress, mongodb-memory-server, supertest, fast-check, husky.
- **`overrides.ip-address`** — pins `ip-address` to `^10.5.0` to avoid a transitive dependency conflict.

## Relationships

- **`src/app/routes.ts`, `request-context.ts`, `security.ts`, `error-handling.ts`, `demo.ts`, `static-assets.ts`, `telemetry.ts`** — the app modules that the `main`/`dev`/`start` scripts launch. Their runtime needs (Express, helmet, rate-limit-redis, @opentelemetry/*, winston, zod, sharp) are satisfied by the `dependencies` declared here.
- **`src/infrastructure/adapters/image.ts`** — consumes the `sharp` dependency declared in this file.
- **`tests/cross-cutting/contract-error-declarations.test.ts`** — executed by the `test:cross-cutting` script (`jest tests/cross-cutting`); relies on `jest-openapi` and `supertest` from `devDependencies`.
- **`tests/support/spec-walk.ts`** — utility used by cross-cutting/contract tests; its type-checking is covered by the `ts-check` script (`tsc --noEmit`).
- **`src/cluster.ts`** (referenced by `main`, not a listed neighbor) — the actual process entry that imports and wires the `src/app/*` modules above.

## Notes

- `postinstall` runs every `npm install`, so CI and local environments will regenerate `api/` (Orval) and `src/types/asyncapi.generated.ts` automatically. A stale `node_modules` can silently change generated output.
- The `test` script chains five Jest suites sequentially; each tier after unit runs with `--runInBand`, so parallelism is only within a single suite.
- `lint` enforces `--max-warnings 0`; any ESLint warning is a hard failure.
- `compose` defaults to `podman` but honours the `CONTAINER_ENGINE` env var to fall back to `docker`.
- The `host` script (`cross-env … npm run`) is a passthrough helper for overriding DB/Redis host env vars in a single invocation; it does not itself run a server.
- `overrides` only pins `ip-address`; no other dependency resolutions are forced.
- `sharp` is pinned to an exact version (`0.35.4`) rather than a semver range, unlike every other dependency.
