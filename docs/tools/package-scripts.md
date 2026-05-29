# Package Scripts

This page groups the `package.json` scripts by job instead of by raw list order.

## Runtime scripts

| Script               | Job                                            | Read more                                 |
| -------------------- | ---------------------------------------------- | ----------------------------------------- |
| `dev`                | watch-mode local runtime from `src/cluster.ts` | [Runtime](./runtime.md)                   |
| `start`              | start the clustered runtime without watch mode | [Runtime](./runtime.md)                   |
| `debug`              | start with Node inspector break-on-start       | [Runtime](./runtime.md)                   |
| `dev:docker`         | single-worker hot reload inside Docker/Podman  | [Docker & Podman](./docker-and-podman.md) |
| `dev:docker:cluster` | clustered hot reload inside Docker/Podman      | [Docker & Podman](./docker-and-podman.md) |

## Validation scripts

| Script                                         | Job                                            | Read more                               |
| ---------------------------------------------- | ---------------------------------------------- | --------------------------------------- |
| `ts-check`                                     | TypeScript no-emit type check                  | [Testing & Docs](./testing-and-docs.md) |
| `lint` / `lint:fix`                            | ESLint check or autofix                        | [Testing & Docs](./testing-and-docs.md) |
| `prettier` / `prettier:check` / `prettier:fix` | format inspect or rewrite                      | [Testing & Docs](./testing-and-docs.md) |
| `build-only`                                   | current lint-only build step                   | [Testing & Docs](./testing-and-docs.md) |
| `build`                                        | `ts-check` + `build-only` composite gate       | [Testing & Docs](./testing-and-docs.md) |
| `complete`                                     | build + test + mutating lint/prettier pass     | [Testing & Docs](./testing-and-docs.md) |
| `complete:check`                               | build + test + non-mutating lint/prettier pass | [Testing & Docs](./testing-and-docs.md) |

## Test scripts

| Script             | Job                                                                         | Read more                                      |
| ------------------ | --------------------------------------------------------------------------- | ---------------------------------------------- |
| `test`             | run unit then integration suites                                            | [Testing & Docs](./testing-and-docs.md)        |
| `test:unit`        | full Jest unit suite                                                        | [Testing & Docs](./testing-and-docs.md)        |
| `test:integration` | HTTP integration suite in-band                                              | [Testing & Docs](./testing-and-docs.md)        |
| `test:unit:target` | placeholder one-file Jest command for focused debugging                     | [Testing & Docs](./testing-and-docs.md)        |
| `test:prism`       | run a quick Prism mock smoke test from `openapi.yaml`                       | [OpenAPI Workflow](../api/openapi-workflow.md) |
| `setup:mongod`     | copy a `mongod` binary from a Docker image for restricted test environments | [Testing & Docs](./testing-and-docs.md)        |

## Contract and docs scripts

| Script                                     | Job                                                       | Read more                                        |
| ------------------------------------------ | --------------------------------------------------------- | ------------------------------------------------ |
| `lint:openapi` / `lint:openapi:fix`        | lint OpenAPI contract with Spectral                       | [OpenAPI Workflow](../api/openapi-workflow.md)   |
| `genapi`                                   | regenerate derived `api/` client code from `openapi.yaml` | [OpenAPI Workflow](../api/openapi-workflow.md)   |
| `lint:asyncapi`                            | validate `asyncapi.yaml`                                  | [AsyncAPI Workflow](../api/asyncapi-workflow.md) |
| `gen:asyncapi-types`                       | regenerate async TS types from `asyncapi.yaml`            | [AsyncAPI Workflow](../api/asyncapi-workflow.md) |
| `docs:asyncapi`                            | open AsyncAPI Studio locally                              | [AsyncAPI Workflow](../api/asyncapi-workflow.md) |
| `docs:dev` / `docs:build` / `docs:preview` | local docs authoring, production build, and preview       | [Testing & Docs](./testing-and-docs.md)          |

## Database & seed scripts

| Script              | Job                            | Read more          |
| ------------------- | ------------------------------ | ------------------ |
| `db:migrate:up`     | apply pending Mongo migrations | direct CLI wrapper |
| `db:migrate:down`   | roll back the last migration   | direct CLI wrapper |
| `db:migrate:status` | inspect migration state        | direct CLI wrapper |
| `db:seed`           | load seed data                 | direct CLI wrapper |
| `db:seed:reset`     | reset and reload seed data     | direct CLI wrapper |

## Container & host helper scripts

| Script                  | Job                                                            | Read more                                 |
| ----------------------- | -------------------------------------------------------------- | ----------------------------------------- |
| `podman:restart`        | restart the compose stack                                      | [Docker & Podman](./docker-and-podman.md) |
| `podman:rebuild`        | rebuild images and restart the stack                           | [Docker & Podman](./docker-and-podman.md) |
| `podman:nuke`           | force-stop stuck Podman processes and restart the user service | [Docker & Podman](./docker-and-podman.md) |
| `kill:win` / `kill:gnu` | emergency local process cleanup helpers                        | local developer convenience               |

## Maintenance & publishing scripts

| Script           | Job                                             | Read more              |
| ---------------- | ----------------------------------------------- | ---------------------- |
| `update:all`     | bump dependency ranges with `npm-check-updates` | dependency maintenance |
| `publish:public` | publish the package publicly to npm             | release workflow       |

## Related pages

- [Package Dependencies](./package-dependencies.md)
- [Docker & Podman](./docker-and-podman.md)
- [API](../api/)
