---
source: package.json
sha256: c05c8cf6fe87ed785a68b16439d5f0e7fe22bf0be3bc3f269b06e8c3cd3616b7
generated_at: 2026-10-15T09:33:40.293946+00:00
model: ollama:qwen3.8:27b
---

# package.json

## Purpose

Project manifest for `boilerplate-node-api-mongodb-mongoose` (v3.0.0). Defines the full set of npm scripts that drive development, testing, contract validation, code generation, documentation, and operational tooling. It also pins all runtime and dev dependencies. The `postinstall` and `prepare` hooks ensure generated artifacts (API types, contract bundles, permission actions, git hooks) are present immediately after `npm install`.

## Key elements

- **`scripts`** — ~100 npm scripts grouped by concern: dev/serve (`dev`, `dev:docker`), testing (`test:unit`, `test:contract`, `test:fuzz`), lint/type-check (`ts-check`, `lint`), contract tooling (`lint:openapi`, `lint:asyncapi`, `contracts:bundle`, `authorization:bundle`), code generation (`gen:api`, `gen:asyncapi`, `gen:permission-actions`), documentation (`docs:*`), operational maintenance (`reap:*`, `sweep:*`, `reencrypt`), container orchestration (`compose:*`), and compound gates (`complete`, `complete:static`, `complete:light`).
- **`postinstall`** — Runs `gen:permission-actions`, `contracts:bundle`, `gen:api`, and `gen:asyncapi` to regenerate type bundles and permission maps on every install.
- **`prepare`** — Invokes `husky` to install git hooks.
- **`devDependencies`** — Includes tooling for linting (ESLint, Prettier, Spectral, Stryker mutation testing), TypeScript compilation (SWC, Babel), OpenAPI/AsyncAPI validation, Prism mock server, dependency-cruiser, and VitePress docs.
- **`main`** — Points to `src/cluster.ts`, the cluster-mode entry point.

## Relationships

- **`src/app.ts` / `src/app/routes.ts` / `src/app/error-handling.ts` / `src/app/security.ts` / `src/app/telemetry.ts` / `src/app/static-assets.ts`** — The `start`, `dev`, `e2e:serve`, and `debug` scripts launch the application whose bootstrap logic lives in `src/cluster.ts` → these app modules.
- **`src/infrastructure/runtime/server-lifecycle.ts`** — Referenced indirectly: the `start`/`dev` scripts invoke the server lifecycle that this module encapsulates.
- **`scenarios/support/demo.ts`** — Imported via the `--import ./scenarios/support/development-doubles.ts` flag in nearly every dev/test/demo script, registering in-memory fakes before app code loads.
- **`scenarios/flows/loopback.ts`** — Part of the scenario suite driven by `scenario:apply` and `demo` scripts.
- **`src/modules/account/session/device-label.ts`** — Consumed by the contract and integration test suites (`test:contract`, `test:integration`) that the `test` script orchestrates.
- **`tests/contract/password-set-paths.test.ts`**, **`tests/cross-cutting/contract-error-declarations.test.ts`**, **`tests/cross-cutting/replace-patch-parity.test.ts`** — Executed by `test:contract` and `test:cross-cutting` scripts respectively; these suites are aggregated under the top-level `test` script.
- **`src/infrastructure/adapters/image.ts`** — Exercised by integration and contract test runs; also touched by `scenario:images` for seed-image generation.

## Notes

- **Container engine is podman by default.** The `compose` and `bench:k6` scripts use `${CONTAINER_ENGINE:-podman}`. If you use Docker, set `CONTAINER_ENGINE=docker`.
- **`postinstall` generates code.** A clean `node_modules` is not enough — API client types (`api/`), AsyncAPI types (`src/types/asyncapi.generated.ts`), contract bundles, and permission-action maps are all produced at install time. Deleting `api/` without re-running `npm run gen:api` will break the build.
- **`complete` is the full CI gate.** It chains lint → prettier → all static checks (TS, OpenAPI, AsyncAPI, dep-cruiser, doc-generation round-trips) → docs build → all test suites. Use `complete:light` for a faster local loop (lint + gates + unit + cross-cutting only).
- **`host` script is a prefix, not a full command.** It sets empty `NODE_DB_URI` / `NODE_REDIS_URL` and localhost hosts, then expects `npm run <script>` to follow. It is not a runnable script on its own.
- **Test randomization.** `test:order-random` runs integration + contract + fuzz suites in-band with randomized order; the seed is printed for reproducibility.
- **Mutation testing is separate.** `mutation` / `mutation:full` use Stryker and are not part of the `test` or `complete` pipelines.
