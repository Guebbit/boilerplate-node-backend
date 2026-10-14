---
source: package.json
sha256: e4710addf942df01b9e38551be9f6dab5bab0bb900c55b39d0757011d2944a6f
generated_at: 2026-10-14T14:30:26.171042+00:00
model: ollama:qwen3.8:27b
---

# package.json

## Purpose

Project manifest for the `boilerplate-node-api-mongodb-mongoose` package (v3.0.0, AGPL-3.0-or-later). It declares the entry point (`src/cluster.ts`), all npm scripts that orchestrate development, testing, linting, contract validation, code generation, ops automation, and container management, and pins dev/runtime dependencies. Every script in this repo is invoked through a name listed here.

## Key elements

- **`main`** — `src/cluster.ts`; the process entry point for `start`, `dev`, `debug`, and most test/e2e scripts.
- **`scripts.dev` / `scripts.dev:docker`** — Runs `src/cluster.ts` (or `src/serve.ts`) under `tsx watch` or `nodemon`, injecting `scenarios/support/development-doubles.ts` via `--import`.
- **`scripts.demo`** — Launches `scenarios/run-server.ts` with the same development-doubles import.
- **`scripts.gen:api`** — Regenerates the `./api` directory: `orval` codegen, error-codes, request-content-types, and permission-actions.
- **`scripts.gen:asyncapi`** — Generates `src/types/asyncapi.generated.ts` from AsyncAPI specs.
- **`scripts.contracts:bundle` / `scripts.check:contracts-bundle`** — Builds (or verifies) OpenAPI/AsyncAPI bundles.
- **`scripts.lint:openapi*` / `scripts.lint:asyncapi*`** — Spectral lint passes against root and per-module spec files.
- **`scripts.check:dependencies`** — Runs `depcruise` with three separate configs (app, modules, bootstrap) to enforce dependency boundaries.
- **`scripts.check:dependencies`** (docs checks) — `check:docs-*` scripts verify generated documentation artifacts are up to date.
- **`scripts.test`** — Sequential: unit → cross-cutting → integration → contract → fuzz, each via `tsx scripts/testing/run-suite.ts <suite>`.
- **`scripts.mutation*`** — Stryker mutation-testing lifecycle (diff run, shards, baseline check/pull).
- **`scripts.reap:*` / `scripts.sweep:*`** — Ops housekeeping tasks (quarantine, mail spool, orders, payments, outbox, webhook retries, etc.).
- **`scripts.bench*`** — Autocannon and k6 load-testing against a running server.
- **`scripts.compose*`** — Wraps `${CONTAINER_ENGINE:-podman} compose` for local infra.
- **`scripts.postinstall`** — Auto-runs `gen:permission-actions`, `contracts:bundle`, `gen:api`, `gen:asyncapi` after every `npm install`.
- **`scripts.prepare`** — `husky`; installs git hooks.
- **`scripts.complete`** — Full CI gate: static checks → all contract/docs/dependency gates → docs build → full test suite.
- **`devDependencies`** (partial) — Spectral, Stryker, SWC, Jest, commitlint, Prism, Redocly, AsyncAPI tooling, `@swc/core`/`@swc/jest` for transpilation.

## Relationships

- **`scenarios/support/demo.ts`** — Imported (via `--import`) by `dev`, `demo`, `debug`, `e2e:serve`, and most test scripts; provides development doubles/stubs for external services.
- **`scenarios/flows/loopback.ts`** — Part of the scenario flow system exercised by `scenario:apply` and integration/e2e suites.
- **`src/app.ts`** and its children (`error-handling.ts`, `request-context.ts`, `routes.ts`, `security.ts`, `static-assets.ts`, `telemetry.ts`) — The application layer that `src/cluster.ts` (the `main` entry) boots; scripts like `start`, `dev`, `test:*` all depend on this tree being importable.
- **`src/infrastructure/runtime/server-lifecycle.ts`** — Lifecycle logic (start/shutdown) invoked by `src/cluster.ts`.
- **`src/infrastructure/adapters/image.ts`** — Infrastructure adapter; targeted by `reap:orphaned-images` and `scenario:images` scripts.
- **`src/modules/account/session/device-label.ts`** — Module code; the module dependency-cruiser config (`.dependency-cruiser.modules.cjs`) referenced by `check:dependencies` enforces boundaries around files in this tree.
- **`tests/contract/password-set-paths.test.ts`** — Executed by `test:contract` (via `run-suite.ts contract`); validates contract-level password endpoints.
- **`tests/cross-cutting/contract-error-declarations.test.ts`** — Executed by `test:cross-cutting`; asserts error-declaration consistency across modules.
- **`tests/cross-cutting/replace-patch-parity.test.ts`** — Executed by `test:cross-cutting`; verifies PUT/PATCH semantic parity.

## Notes

- **Container engine is podman by default.** All `compose*` and `bench:k6*` scripts use `${CONTAINER_ENGINE:-podman}`. Set `CONTAINER_ENGINE=docker` to override.
- **`postinstall` generates code.** `gen:api` does `rm -rf ./api` before regenerating. A stale or failed `orval` run can leave `./api` empty until the next successful install.
- **`--import ./scenarios/support/development-doubles.ts`** is prepended to nearly every runtime script. This file is a hard prerequisite for `dev`, `demo`, `debug`, `e2e:serve`, and all test suites—missing or broken doubles break the entire pipeline.
- **`build` is not a compilation step.** It runs `ts-check` (type-check only) + `lint`. There is no `tsc --emit`; the project runs directly via `tsx`.
- **`complete` vs `complete:light` vs `complete:static`.** `complete` is the full CI gate (static + docs build + all tests). `complete:light` skips integration/contract/fuzz tests. `complete:static` skips all tests. Pick the right one for the context.
- **`host` script is a prefix, not a command.** It sets env vars and expects a trailing `npm run <target>` (e.g., `npm run host dev`).
- **Version is 3.0.0** — a major-boilerplate version, not a semver for a product.
