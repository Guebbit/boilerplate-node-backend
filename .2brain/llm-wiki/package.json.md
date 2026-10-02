---
source: package.json
sha256: 2faabd9f4d8b7af9a6e3084e4264d98f8c95620c7a95732f6db2fab1daa6ce62
generated_at: 2026-10-01T12:19:35.693885+00:00
model: ollama:qwen3.8:27b
---

# package.json

## Purpose

Root manifest for the **boilerplate-node-api-mongodb-mongoose** project (v2.0.0, AGPL-3.0-or-later). It defines the entry point, every npm script (dev, test, lint, contract validation, docs generation, Docker orchestration, ops tasks), and all dev/runtime dependencies. It is the single source of truth for how the project is built, tested, and deployed.

## Key elements

- **`name` / `version` / `license`** — project identity: `boilerplate-node-api-mongodb-mongoose`, `2.0.0`, `AGPL-3.0-or-later`.
- **`main`: `src/cluster.ts`** — entry point, executed via `tsx` (TypeScript, no pre-compile step).
- **`scripts`** — ~90 named scripts grouped by concern:
  - *Dev / serve*: `dev`, `dev:docker`, `start`, `debug`, `e2e:serve`.
  - *Testing*: `test` (unit → cross-cutting → integration → contract → fuzz), `test:unit:coverage`, `test:order-random`, `test:cluster`, `test:prism`.
  - *Mutation*: `mutation`, `mutation:full`, `mutation:check`.
  - *Lint / type-check*: `ts-check`, `lint`, `lint:openapi`, `lint:asyncapi`, `prettier:check`.
  - *Contract / codegen*: `gen:api`, `gen:permission-actions`, `gen:asyncapi`, `contracts:bundle`, `authorization:bundle`, `check:asyncapi-breaking`, `check:spec-identity`.
  - *Docs generation & check*: `docs:graph`, `docs:roles`, `docs:dependencies`, `docs:rate-limits`, `docs:config`, `docs:audit-actions`, and their `check:docs-*` counterparts.
  - *DB / ops*: `db:sync`, `db:bootstrap`, `scenario:apply`, `reap:*`, `sweep:*`, `clean:orphaned-images`.
  - *Docker*: `compose` (wraps `${CONTAINER_ENGINE:-podman} compose`), `compose:up`, `compose:rebuild`, etc.
  - *CI gates*: `complete` (full pipeline), `complete:light` (faster subset), `complete:manual` (Prism + cluster), `complete:fix`.
  - *Scaffolding / benchmarking / docs site*: `scaffold:module`, `bench*`, `docs:dev|build|preview` (VitePress).
- **`devDependencies`** — TypeScript tooling (SWC, Jest, ESLint + typescript-eslint), Stoplight Spectral (OpenAPI/AsyncAPI linting), AsyncAPI tooling, Stryker mutator, dependency-cruiser, autocannon/k6 (load), Husky, VitePress, and type packages for runtime libs.
- **`postinstall`** — runs codegen on every `npm install`: `gen:permission-actions`, `contracts:bundle`, `gen:api` (Orval + error codes + content types + permission actions), `gen:asyncapi`.
- **`prepare`** — `husky` (git hook installation).

## Relationships

- **`src/cluster.ts`** (main entry) — the `dev`, `start`, `debug`, and `e2e:serve` scripts all invoke it; it is the file that bootstraps the entire application tree (`src/app/*`, `src/infrastructure/*`).
- **`src/app/demo.ts`, `src/app/routes.ts`, `src/app/security.ts`, `src/app/error-handling.ts`, `src/app/request-context.ts`, `src/app/static-assets.ts`, `src/app/telemetry.ts`** — application-layer modules covered by the `ts-check`, `lint`, `check:dependencies`, and `test:*` scripts; not individually referenced by name in any script.
- **`src/infrastructure/runtime/server-lifecycle.ts`** and **`src/infrastructure/adapters/image.ts`** — infrastructure modules pulled in transitively when the cluster entry point starts; subject to the same lint/type-check/dependency-cruise gates.
- **`scenarios/flows/loopback.ts`** — lives under the `scenarios/` tree exercised by `scenario:apply`, `scenario:apply:reset`, and `demo` scripts.
- **`tests/cross-cutting/contract-error-declarations.test.ts`**, **`tests/cross-cutting/replace-patch-parity.test.ts`** — executed by the `test:cross-cutting` suite (`run-suite.ts cross-cutting`).
- **`tests/support/spec-walk.ts`** — shared test-support helper available to all test suites invoked through `run-suite.ts`.
- **`check:dependencies`** — runs `dependency-cruiser` over the entire `src` and `tests` trees, enforcing import-layer boundaries across all the files above.

## Notes

- **`postinstall` generates code.** A fresh `npm install` will produce `api/`, bundled contracts, and `src/types/asyncapi.generated.ts`. These artifacts are not committed (see `.gitignore`); they must be regenerated before the app can compile.
- **`host` script is a prefix, not a command.** It sets env vars and ends with `npm run` — it is meant to be followed by another script name on the same command line (e.g. `npm run host dev`). Running `npm run host` alone will fail.
- **Container engine is configurable.** All `compose*` and `bench:k6*` scripts use `${CONTAINER_ENGINE:-podman}`, defaulting to Podman but respecting Docker.
- **`complete` vs `complete:light`.** `complete` includes integration, contract, fuzz, and docs-build steps; `complete:light` stops after cross-cutting tests and skips the docs site build. Use the appropriate gate in CI.
- **TypeScript run at runtime.** There is no `build`/`tsc` compilation step in the normal flow; `tsx` transpiles on the fly. `tsc --noEmit` (`ts-check`) is a type-only gate.
- **AGPL-3.0-or-later** license — any derivative distribution must comply with AGPL terms.
