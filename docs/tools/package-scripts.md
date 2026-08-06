# Package Scripts

This page groups the `package.json` scripts by job instead of by raw list order.

## Runtime scripts

| Script               | Job                                                                                        | Read more                                 |
| -------------------- | ------------------------------------------------------------------------------------------ | ----------------------------------------- |
| `dev`                | watch-mode local runtime from `src/cluster.ts` — expects the compose hostnames from `.env` | [Runtime](./runtime.md)                   |
| `dev:host`           | same, with the Mongo and Redis **hostnames** redirected to `localhost`                     | [Runtime](./runtime.md)                   |
| `start`              | start the clustered runtime without watch mode                                             | [Runtime](./runtime.md)                   |
| `debug`              | start with Node inspector break-on-start                                                   | [Runtime](./runtime.md)                   |
| `dev:docker`         | single-worker hot reload inside Docker/Podman                                              | [Docker & Podman](./docker-and-podman.md) |
| `dev:docker:cluster` | clustered hot reload inside Docker/Podman                                                  | [Docker & Podman](./docker-and-podman.md) |

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

| Script               | Job                                                                                                                                 | Read more                                      |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| `test`               | run unit, then integration, then contract                                                                                           | [Testing & Docs](./testing-and-docs.md)        |
| `test:unit`          | `tests/unit` only — logic below HTTP                                                                                                | [Testing & Docs](./testing-and-docs.md)        |
| `test:unit:coverage` | the same suite with a coverage report                                                                                               | [Testing & Docs](./testing-and-docs.md)        |
| `test:integration`   | HTTP integration suite in-band                                                                                                      | [Testing & Docs](./testing-and-docs.md)        |
| `test:contract`      | validate real responses against `openapi.yaml`                                                                                      | [Testing & Docs](./testing-and-docs.md)        |
| `test:all`           | every suite in one Jest run — the escape hatch, not the routine                                                                     | [Testing & Docs](./testing-and-docs.md)        |
| `test:mutation`      | Stryker: break the source on purpose and report what the tests failed to notice. Slow — nightly or before a refactor, never in a PR | [Testing & Docs](./testing-and-docs.md)        |
| `test:unit:target`   | placeholder one-file Jest command for focused debugging                                                                             | [Testing & Docs](./testing-and-docs.md)        |
| `test:prism`         | run a quick Prism mock smoke test from `openapi.yaml`                                                                               | [OpenAPI Workflow](../api/openapi-workflow.md) |
| `setup:mongod`       | copy a `mongod` binary from a Docker image for restricted test environments                                                         | [Testing & Docs](./testing-and-docs.md)        |

## Contract and docs scripts

| Script                                     | Job                                                       | Read more                                        |
| ------------------------------------------ | --------------------------------------------------------- | ------------------------------------------------ |
| `lint:openapi` / `lint:openapi:fix`        | lint OpenAPI contract with Spectral                       | [OpenAPI Workflow](../api/openapi-workflow.md)   |
| `genapi`                                   | regenerate derived `api/` client code from `openapi.yaml` | [OpenAPI Workflow](../api/openapi-workflow.md)   |
| `lint:asyncapi`                            | validate `asyncapi.yaml`                                  | [AsyncAPI Workflow](../api/asyncapi-workflow.md) |
| `genasyncapi`                              | regenerate async TS types from `asyncapi.yaml`            | [AsyncAPI Workflow](../api/asyncapi-workflow.md) |
| `docs:asyncapi`                            | open AsyncAPI Studio locally                              | [AsyncAPI Workflow](../api/asyncapi-workflow.md) |
| `docs:dev` / `docs:build` / `docs:preview` | local docs authoring, production build, and preview       | [Testing & Docs](./testing-and-docs.md)          |

## Database & seed scripts

Migrations own **schema** (indexes, collection options); the seeder owns **demo data**. Both are
idempotent, and `db:bootstrap` chains them — it is what the compose `app` service runs before
starting the server.

| Script              | Job                                                | Read more                       |
| ------------------- | -------------------------------------------------- | ------------------------------- |
| `db:migrate:up`     | apply pending Mongo migrations (indexes/schema)    | direct CLI wrapper              |
| `db:migrate:down`   | roll back the last migration                       | direct CLI wrapper              |
| `db:migrate:status` | inspect migration state                            | direct CLI wrapper              |
| `db:seed`           | upsert the demo dataset (no-op if already present) | direct CLI wrapper              |
| `db:seed:reset`     | drop the database, then reseed                     | direct CLI wrapper              |
| `db:cache:clear`    | drop every cached response under the app's prefix  | [Redis cache](./redis-cache.md) |
| `db:bootstrap`      | `db:migrate:up` followed by `db:seed`              | runs on container boot          |

`db:seed` calls `db:cache:clear`'s logic itself whenever it created something. Run the script by
hand after editing the database another way (`mongosh`, a GUI) — those writes never reach the
API, so nothing else invalidates the cache. See _Seeding and the response cache_ in the repo
README.

Every one of these has a `:host` twin (`db:seed:host`, `db:cache:clear:host`, `db:bootstrap:host`,
…) that redirects the **hostname** to `localhost` via `cross-env` — by blanking `NODE_DB_URI` /
`NODE_REDIS_URL` so the resolvers fall through to `NODE_MONGODB_HOST` / `NODE_REDIS_HOST`, leaving
the port and the database name to `.env`. The shipped `.env` uses compose hostnames, so the plain
scripts only resolve from inside a container — see _Running on the host_ in the repo README.

They deliberately do **not** spell out a URI. One that includes the database name overrides
`NODE_MONGODB_NAME` without saying so, which is how these scripts used to seed a database nobody
had configured.

## Container & host helper scripts

Each runtime has the same three verbs. Use them instead of a bare `compose up`: they pass that
runtime's Promtail override with `-f`, which is what gives Promtail a host log path to tail.

| Script                              | Job                                                                                                                                                        | Read more                                 |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| `podman:restart` / `docker:restart` | restart the compose stack                                                                                                                                  | [Docker & Podman](./docker-and-podman.md) |
| `podman:rebuild` / `docker:rebuild` | rebuild images and restart the stack                                                                                                                       | [Docker & Podman](./docker-and-podman.md) |
| `podman:kill` / `docker:kill`       | force-stop this project's compose containers                                                                                                               | [Docker & Podman](./docker-and-podman.md) |
| `podman:compose` / `docker:compose` | the `compose -f base -f override` invocation the three above share; call it directly for one-off subcommands, e.g. `npm run podman:compose -- logs -f app` | [Docker & Podman](./docker-and-podman.md) |

## Maintenance & publishing scripts

| Script           | Job                                             | Read more              |
| ---------------- | ----------------------------------------------- | ---------------------- |
| `update:all`     | bump dependency ranges with `npm-check-updates` | dependency maintenance |
| `publish:public` | publish the package publicly to npm             | release workflow       |

## Related pages

- [Package Dependencies](./package-dependencies.md)
- [Docker & Podman](./docker-and-podman.md)
- [API](../api/)
