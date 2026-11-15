---
source: package.json
sha256: a9c39e8606ea8d81bee87e0bad26ce13a99df159ab16e9705e37821b7a06595a
generated_at: 2026-11-14T17:14:46.514012+00:00
model: ollama:qwen3.8:27b
---

# package.json

## Purpose
Project manifest and task runner for **boilerplate-node-api-mongodb-mongoose** (v3.0.0, AGPL-3.0-or-later). It declares the npm dependency set (runtime + dev) and encodes the entire build, test, lint, codegen, ops, and CI-gate workflow as `npm run` scripts. The `postinstall` hook generates all API/AsyncAPI client code on every install, making the generated `api/` and `src/types/` trees a build-time artefact.

## Key elements
- **`scripts.dev` / `scripts.start`** — Dev server via `tsx watch` with a `--import` flag for development doubles; production entry is `src/main.ts` (the `"main"` field).
- **`scripts.postinstall`** — Regenerates scenario registries, authorization bundle, permission vocabulary, shared rule schemas, contract bundles, `orval`-generated API clients, and AsyncAPI types. Any change to `openapi.yaml` or `asyncapi.yaml` requires a fresh `npm install` (or `npm run gen:api` / `gen:asyncapi`) to propagate.
- **`scripts.complete` family** — Layered CI gates: `complete:static` → lint + format + contract lint + dependency-cruiser checks; `complete` adds docs build + full test suite; `complete:light` is a fast subset (unit + cross-cutting only); `complete:manual` covers Prism smoke, cluster, and broker tests that need live infra.
- **`scripts.test` / `test:*`** — Five suites (unit, cross-cutting, integration, contract, fuzz) all routed through `scripts/testing/run-suite.ts`. Variant scripts toggle `NODE_SESSION_MODE`, randomization, sharding, and report output.
- **`scripts.lint:openapi*` / `lint:asyncapi*`** — Spectral ruleset checks against `openapi.yaml`, per-module specs, and `asyncapi.yaml` (root + per-module).
- **`scripts.gen:api`** — Wipes `api/`, runs `orval`, then emits error-codes, request content-types, upload types, redirect-query, and permission-vocabulary TS files.
- **`scripts.mutation*`** — Stryker diff/full/baseline mutation testing.
- **`scripts.compose*`** — Wraps `podman compose` (honours `CONTAINER_ENGINE` override) for local infra up/restart/rebuild.
- **`devDependencies`** — Includes `typescript ~6.0.0`, `jest ^30`, `eslint ^10`, `prettier ^3`, `orval`, `@stoplight/spectral-cli`, `@stryker-mutator/core`, `fast-check`, `dependency-cruiser`, `vitepress`, `mongodb-memory-server`, `nodemon`.
- **`dependencies`** — OpenTelemetry stack (`sdk-node`, `sdk-trace`, instrumentations for express/http/mongoose/redis), `@casl/ability` + `@casl/mongoose`, `amqplib`, `altcha-lib`, `@guebbit/js-toolkit`, and (truncated) the Express/Mongoose core.

## Relationships
- **`src/app.ts`** — The application module that the `dev`/`start`/`e2e:serve`/`debug` scripts boot; all of its sibling modules below are exercised by the test and lint scripts defined here.
- **`src/app/routes.ts`, `security.ts`, `static-assets.ts`, `error-handling.ts`, `request-context.ts`** — App-layer modules covered by `test:contract`, `test:integration`, and `test:unit`; linted by `eslint` and bounded by the `dependency-cruiser` invocations in the `check` script.
- **`src/app/telemetry.ts`** — Consumes the `@opentelemetry/*` packages in `dependencies`; validated by `ts-check` and `lint`.
- **`src/infrastructure/runtime/otel-sdk.ts`** — Directly uses the OpenTelemetry dependency set; exercised by `npm run test:unit`.
- **`src/infrastructure/runtime/server-lifecycle.ts`** — Infrastructure runtime module bounded by the `depcruise` rules in `check`; covered by integration and cluster test suites (`test:cluster`).
- **`src/infrastructure/adapters/image.ts`** — Infrastructure-layer adapter constrained by the same `dependency-cruiser` boundary rules.
- **`scenarios/flows/loopback.ts`** — Scenario flow executed by the `scenario:apply` and `demo` scripts.
- **`scenarios/support/demo.ts`** — Referenced by the `demo` script path (`scenarios/run-server.ts` imports from it).
- **`scenarios/support/doubles/payments/levers.ts`** — Payment scenario double pulled in by the `--import` flag in `dev`, `demo`, `debug`, and `e2e:serve` scripts.
- **`src/modules/account/session/device-label.ts`** — Module-layer code covered by `test:unit` and the `test:contract:cookie` variant (`NODE_SESSION_MODE=cookie`).
- **`tests/unit/infrastructure/runtime/otel-sdk.test.ts`** — Executed by `npm run test:unit`; validated for test honesty by `audit:test-candidates`.

## Notes
- **`postinstall` is a hard gate**: generated files (`api/`, `src/types/asyncapi.generated.ts`, `shared/authorization-keys.generated.yaml`, contract bundles) are *not* committed. Skipping `npm install` after a schema change will cause `ts-check` and `lint` to fail on missing/stale imports.
- **`prepare` runs `husky`**: git hooks are installed on `npm install` in a workspace clone; CI or Docker layers that skip install will miss them.
- **`scripts.host`** is a pass-through prefix (`npm run <cmd>` with empty env-var overrides for DB/Redis) meant to be chained, e.g. `npm run host start`.
- **`CONTAINER_ENGINE`** defaults to `podman`; all `bench` and `compose` scripts respect this.
- **TypeScript version is pinned to `~6.0.0`** (tilde, not caret) — a minor TS bump is disallowed; major bump is allowed but unlikely.
- The `check` script runs **three** separate `dependency-cruiser` invocations with different configs (root, modules, bootstrap) — all must pass green.
- `scripts.lint` uses `--max-warnings 0`; any ESLint warning is a failure.
