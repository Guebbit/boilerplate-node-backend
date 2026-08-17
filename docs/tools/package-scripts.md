# Package Scripts

This page groups the `package.json` scripts by job instead of by raw list order.

**The three you actually type every day**, in case you never read further:

| Script                    | When                                                                                              |
| ------------------------- | ------------------------------------------------------------------------------------------------- |
| `npm run compose:restart` | bring the stack up — [Getting Started](../getting-started.md)                                     |
| `npm run regenerate`      | after changing anything a generator reads — [Regenerating After a Change](../api/regenerating.md) |
| `npm run complete`        | before committing — the same gate pre-commit runs                                                 |

`regenerate` writes; `complete` only verifies. A gate failure saying **STALE** means the first one
was not run. In the paired frontend the mirror command is `npm run regenerate` too — run it after
every pull, or the app ships a client for the previous contract.

## Two prefixes that replace a family each

Neither is a script you run alone — both wrap another one, and each exists because the alternative
was the same string copied N times:

| Prefix                     | Replaces                                 | Example                          |
| -------------------------- | ---------------------------------------- | -------------------------------- |
| `npm run host -- <script>` | the seven `db:*:host` / `dev:host` twins | `npm run host -- db:seed:reset`  |
| `npm run compose -- <cmd>` | `podman:compose` and `docker:compose`    | `npm run compose -- logs -f app` |

`host` blanks `NODE_DB_URI` / `NODE_REDIS_URL` and points both hostnames at `localhost`, then hands
off to `npm run` — see [Database & seed scripts](#database-seed-scripts). `compose` expands to
`${CONTAINER_ENGINE:-podman} compose` — see [Container scripts](#container-scripts).

## Runtime scripts

| Script               | Job                                                                                        | Read more                                 |
| -------------------- | ------------------------------------------------------------------------------------------ | ----------------------------------------- |
| `dev`                | watch-mode local runtime from `src/cluster.ts` — expects the compose hostnames from `.env` | [Runtime](./runtime.md)                   |
| `host`               | prefix wrapper: `npm run host -- dev` runs any script against `127.0.0.1` datastores       | [Runtime](./runtime.md)                   |
| `start`              | start the clustered runtime without watch mode                                             | [Runtime](./runtime.md)                   |
| `debug`              | start with Node inspector break-on-start                                                   | [Runtime](./runtime.md)                   |
| `dev:docker`         | single-worker hot reload inside Docker/Podman                                              | [Docker & Podman](./docker-and-podman.md) |
| `dev:docker:cluster` | clustered hot reload inside Docker/Podman                                                  | [Docker & Podman](./docker-and-podman.md) |

## Validation scripts

| Script                            | Job                                                                                                             | Read more                                        |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| `ts-check`                        | TypeScript no-emit type check                                                                                   | [Testing & Docs](./testing-and-docs.md)          |
| `lint` / `lint:fix`               | ESLint check or autofix                                                                                         | [Testing & Docs](./testing-and-docs.md)          |
| `prettier:check` / `prettier:fix` | format inspect or rewrite                                                                                       | [Testing & Docs](./testing-and-docs.md)          |
| `build`                           | `ts-check` + `lint` composite gate                                                                              | [Testing & Docs](./testing-and-docs.md)          |
| `check:asyncapi-types`            | fail if `src/types/asyncapi.generated.ts` is not what `asyncapi.yaml` generates; writes nothing                 | [AsyncAPI Workflow](../api/asyncapi-workflow.md) |
| `check:spec-identity`             | compare the shared contract files against the paired frontend; skips when it is not on disk, fatal under CI     | [Testing & Docs](./testing-and-docs.md)          |
| `complete`                        | the gate: build + lint + both spec lints + prettier:check + every contract check + tests                        | [Testing & Docs](./testing-and-docs.md)          |
| `complete:fix`                    | the same gate, with lint and formatting fixed rather than reported                                              | [Testing & Docs](./testing-and-docs.md)          |
| `complete:manual`                 | what the gate cannot run for you: `test:prism`, which binds a real port                                         | [Testing & Docs](./testing-and-docs.md)          |
| `bench` / `bench:search`          | autocannon against a RUNNING server; reports latency numbers, has no pass/fail — which is why it is not `test:` | [Load Testing](./load-testing.md)                |

## Test scripts

| Script                   | Job                                                                                                                                 | Read more                                      |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| `test`                   | run unit, cross-cutting, integration, then contract                                                                                 | [Testing & Docs](./testing-and-docs.md)        |
| `test:unit`              | `tests/unit` plus each module's own `tests/unit` — logic below HTTP                                                                 | [Testing & Docs](./testing-and-docs.md)        |
| `test:cross-cutting`     | repo-wide invariants: bundle freshness, locale parity, no hardcoded user text, every controller catches                             | [Regenerating](../api/regenerating.md)         |
| `test:unit:coverage`     | unit + cross-cutting again, in-band, against the per-file coverage floors                                                           | [Testing & Docs](./testing-and-docs.md)        |
| `test:integration`       | HTTP integration suite in-band                                                                                                      | [Testing & Docs](./testing-and-docs.md)        |
| `test:contract`          | validate real responses against `openapi.yaml`                                                                                      | [Contract Testing](./contract-testing.md)      |
| `test:fuzz`              | property/fuzz suite — nightly workflow, not the pre-commit gate                                                                     | [Fuzz Testing](./fuzz-testing.md)              |
| `test:all`               | every suite in one Jest run — the escape hatch, not the routine                                                                     | [Testing & Docs](./testing-and-docs.md)        |
| `test:mutation`          | Stryker: break the source on purpose and report what the tests failed to notice. Slow — nightly or before a refactor, never in a PR | [Mutation Testing](./mutation-testing.md)      |
| `test:mutation:check`    | compare a Stryker run against the committed per-file baseline                                                                       | [Mutation Testing](./mutation-testing.md)      |
| `test:mutation:baseline` | accept the current scores as the new baseline                                                                                       | [Mutation Testing](./mutation-testing.md)      |
| `test:prism`             | run a quick Prism mock smoke test from `openapi.yaml`                                                                               | [OpenAPI Workflow](../api/openapi-workflow.md) |
| `setup:mongod`           | copy a `mongod` binary from a Docker image for restricted test environments                                                         | [Testing & Docs](./testing-and-docs.md)        |
| `bench`                  | autocannon against `GET /products` — the cached read path                                                                           | [Load Testing](./load-testing.md)              |
| `bench:search`           | autocannon against `POST /products/search` — the uncached, database-backed path                                                     | [Load Testing](./load-testing.md)              |

## Contract scripts

Two stages, and they run in this order: **bundle** the committed documents from their per-module
fragments, then **generate** code from the bundles. Full cheat sheet in [Regenerating After a
Change](../api/regenerating.md).

| Script                   | Stage    | Job                                                                                                                 | Read more                                                  |
| ------------------------ | -------- | ------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `contracts:bundle`       | bundle   | rebuild all seven committed bundles from their fragments (to narrow, call `scripts/bundle-contracts.ts` directly)   | [Contract Fragmentation](../api/contract-fragmentation.md) |
| `check:contracts-bundle` | verify   | fail if a bundle is stale or a collection is out of date — the CI/`--check` twin                                    | [Regenerating](../api/regenerating.md)                     |
| `check:spec-identity`    | verify   | fail if the paired frontend holds different bytes of a shared document                                              | [Contract Fragmentation](../api/contract-fragmentation.md) |
| `gen:api`                | generate | `rm -rf ./api`, then regenerate types + Zod schemas from `openapi.yaml` via orval                                   | [OpenAPI Workflow](../api/openapi-workflow.md)             |
| `gen:asyncapi`           | generate | regenerate `src/types/asyncapi.generated.ts` from `asyncapi.yaml`                                                   | [AsyncAPI Workflow](../api/asyncapi-workflow.md)           |
| `check:asyncapi-types`   | verify   | the same generation, compared instead of written — the freshness gate                                               | [AsyncAPI Workflow](../api/asyncapi-workflow.md)           |
| `lint:openapi`           | verify   | lint the bundled `openapi.yaml` with Spectral                                                                       | [OpenAPI Workflow](../api/openapi-workflow.md)             |
| `lint:openapi:modules`   | verify   | lint each `src/modules/*/openapi.yaml` **on its own**, against `spectral.modules.yaml`                              | [Contract Fragmentation](../api/contract-fragmentation.md) |
| `lint:asyncapi`          | verify   | validate the bundled `asyncapi.yaml`                                                                                | [AsyncAPI Workflow](../api/asyncapi-workflow.md)           |
| `lint:asyncapi:modules`  | verify   | the same for each section document, against `spectral.asyncapi.modules.yaml`                                        | [AsyncAPI Workflow](../api/asyncapi-workflow.md)           |
| `seed:export`            | generate | seed a throwaway database with the real seeders and publish what the API answers to `db/seeds/dataset.json`         | [Contract Fragmentation](../api/contract-fragmentation.md) |
| `check:seed-export`      | verify   | fail if `dataset.json` is stale against a fresh seeding run — the dataset's twin of `check:contracts-bundle`        | [Regenerating](../api/regenerating.md)                     |
| `sync:frontend`          | generate | copy the shared documents into the paired frontend checkout, so `check:spec-identity` can go green                  | [Contract Fragmentation](../api/contract-fragmentation.md) |
| `regenerate`             | generate | every generator above, in dependency order, then the sync — the one command to run after changing a generator input | [Regenerating After a Change](../api/regenerating.md)      |

The `:modules` pair is the property the whole-document layout bought. Each module's contract is a
valid document on its own, so it can be linted where it is written rather than only after bundling —
which the old fragment layout could never do, because a fragment parsed as nothing until it was
concatenated.

`contracts:bundle` is safe to run at any time: it compares before it writes and touches only the
bundles that actually drifted. It runs in two stages on purpose — the client collections are
generated _from_ `openapi.yaml`, so the contract must be rebuilt before they are. That ordering
lives in `scripts/bundle-contracts.ts`, which is why `-- <name>` narrows the run properly.

## Docs scripts

| Script                                     | Job                                                 | Read more                                        |
| ------------------------------------------ | --------------------------------------------------- | ------------------------------------------------ |
| `docs:dev` / `docs:build` / `docs:preview` | local docs authoring, production build, and preview | [Testing & Docs](./testing-and-docs.md)          |
| `docs:asyncapi`                            | open AsyncAPI Studio locally                        | [AsyncAPI Workflow](../api/asyncapi-workflow.md) |

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

Any of them runs from the host through the `host` prefix — `npm run host -- db:seed:reset`. It
redirects the **hostname** to `127.0.0.1` via `cross-env`, by blanking `NODE_DB_URI` /
`NODE_REDIS_URL` so the resolvers fall through to `NODE_MONGODB_HOST` / `NODE_REDIS_HOST`, leaving
the port and the database name to `.env`. The literal address rather than the name `localhost`:
that name resolves to both `::1` and `127.0.0.1` in a resolver-decided order, and both engines
publish ports to IPv4 only, so the name intermittently reaches nothing at all. The shipped `.env` uses compose hostnames, so the bare
scripts only resolve from inside a container — see
[Running on the host instead](../getting-started.md#running-on-the-host-instead).

It deliberately does **not** spell out a URI. One that includes the database name overrides
`NODE_MONGODB_NAME` without saying so, which is how these scripts used to seed a database nobody
had configured. It is also deliberately **one** wrapper rather than a `:host` twin per script:
those were seven copies of one `cross-env` prefix, and `db:cache:clear:host` had already drifted —
it blanked Redis but not Mongo. `tests/unit/db/host-scripts.test.ts` fails if a second
hostname-redirecting script appears.

## Container scripts

Three verbs, either engine. Use them instead of a bare `compose up`: they pass the runtime's
Promtail override with `-f`, which is what gives Promtail a host log path to tail.

| Script            | Job                                                                                   | Read more                                 |
| ----------------- | ------------------------------------------------------------------------------------- | ----------------------------------------- |
| `compose:restart` | restart the compose stack                                                             | [Docker & Podman](./docker-and-podman.md) |
| `compose:rebuild` | rebuild images and restart the stack                                                  | [Docker & Podman](./docker-and-podman.md) |
| `compose:kill`    | force-stop this project's compose containers                                          | [Docker & Podman](./docker-and-podman.md) |
| `compose`         | the bare compose invocation the three share; call it directly for one-off subcommands | [Docker & Podman](./docker-and-podman.md) |

```bash
npm run compose -- logs -f app                   # any compose subcommand
CONTAINER_ENGINE=docker npm run compose:restart  # podman is the default
```

All four expand to `${CONTAINER_ENGINE:-podman} compose`. Export `CONTAINER_ENGINE` in your shell
to switch — a **shell** variable, not a `.env` entry, because npm never reads `.env` and so never
sees what is written there. Compose does read it, which is why every other setting on this page can
live in `.env` and this one cannot.

## Maintenance & publishing scripts

| Script       | Job                                                               | Read more              |
| ------------ | ----------------------------------------------------------------- | ---------------------- |
| `update:all` | bump dependency ranges with `npm-check-updates`                   | dependency maintenance |
| `prepare`    | npm lifecycle hook — installs the husky hooks after `npm install` | not run by hand        |

## Related pages

- [Getting Started](../getting-started.md)
- [Regenerating After a Change](../api/regenerating.md)
- [Package Dependencies](./package-dependencies.md)
- [Docker & Podman](./docker-and-podman.md)
- [API](../api/)
