---
type: reference
audience: [anyone]
---

# Package Scripts

This page groups the `package.json` scripts by job instead of by raw list order.

**The four you actually type every day**, in case you never read further:

| Script                    | When                                                                                                |
| ------------------------- | --------------------------------------------------------------------------------------------------- |
| `npm run compose:restart` | bring the stack up — [Getting Started](../build/run-locally.md)                                     |
| `npm run regenerate`      | after changing anything a generator reads — [Regenerating After a Change](../build/regenerating.md) |
| `npm run complete`        | before merging a lane — the full gate; pre-commit runs the light gate                               |
| `npm run scaffold:module` | start a new domain — [Module scaffolder](../build/module-scaffolder.md)                             |

`regenerate` writes; `complete` only verifies. A gate failure saying **STALE** means the first one
was not run. In the paired frontend the mirror command is `npm run regenerate` too — run it after
every pull, or the app ships a client for the previous contract.

## Two prefixes that replace a family each

Neither is a script you run alone — both wrap another one, and each exists because the alternative
was the same string copied N times:

| Prefix                     | Replaces                                 | Example                                |
| -------------------------- | ---------------------------------------- | -------------------------------------- |
| `npm run host -- <script>` | the seven `db:*:host` / `dev:host` twins | `npm run host -- scenario:apply:reset` |
| `npm run compose -- <cmd>` | `podman:compose` and `docker:compose`    | `npm run compose -- logs -f app`       |

`host` blanks `NODE_DB_URI` / `NODE_REDIS_URL` and points both hostnames at `127.0.0.1`, then hands
off to `npm run` — see [Database & seed scripts](#database-seed-scripts). `compose` expands to
`${CONTAINER_ENGINE:-podman} compose` — see [Container scripts](#container-scripts).

## Runtime scripts

| Script              | Job                                                                                                                              | Read more                                                     |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `dev`               | watch-mode local runtime, one process, from `src/main.ts` — expects the compose hostnames from `.env`                            | [Runtime](../understand/runtime.md)                           |
| `demo`              | the real API, self-contained: in-memory Mongo, seeded, cache/queue disabled — what the paired frontend's dev and e2e run against | [Demo profile](../build/demo-profile.md)                      |
| `e2e:serve`         | the single-process runtime with `NODE_E2E_RUN=1`, for the frontend's end-to-end runs                                             | [Demo profile](../build/demo-profile.md)                      |
| `e2e:worker`        | the queue consumers with `NODE_E2E_RUN=1`: a live run that has a broker starts it beside `e2e:serve`                             | [RabbitMQ](../understand/rabbitmq.md#two-processes-one-image) |
| `host`              | prefix wrapper: `npm run host -- dev` runs any script against `127.0.0.1` datastores                                             | [Runtime](../understand/runtime.md)                           |
| `start`             | start one process (`src/main.ts`) without watch mode; what the image runs                                                        | [Runtime](../understand/runtime.md)                           |
| `debug`             | start with Node inspector break-on-start                                                                                         | [Runtime](../understand/runtime.md)                           |
| `dev:docker`        | hot reload inside Docker/Podman                                                                                                  | [Docker & Podman](../build/docker-and-podman.md)              |
| `dev:worker`        | the queue consumers (`src/worker.ts`) with watch mode; needs a broker, and the default `dev` setup has none                      | [RabbitMQ](../understand/rabbitmq.md#two-processes-one-image) |
| `dev:worker:docker` | the same, hot reloaded inside Docker/Podman: what the dev compose `worker` service runs                                          | [RabbitMQ](../understand/rabbitmq.md#two-processes-one-image) |

## Validation scripts

| Script                            | Job                                                                                                                                                                              | Read more                                        |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| `ts-check`                        | TypeScript no-emit type check                                                                                                                                                    | [Testing & Docs](../build/testing-and-docs.md)   |
| `lint` / `lint:fix`               | ESLint check or autofix                                                                                                                                                          | [Testing & Docs](../build/testing-and-docs.md)   |
| `prettier:check` / `prettier:fix` | format inspect or rewrite                                                                                                                                                        | [Testing & Docs](../build/testing-and-docs.md)   |
| `check`                           | every non-lint check in one run: generated files current, AsyncAPI breaking changes, spec identity with the frontend, doc references, the dependency graph                       | [Testing & Docs](../build/testing-and-docs.md)   |
| `complete`                        | the gate: ts-check + lint + both spec lints + prettier:check + `check` + tests                                                                                                   | [Testing & Docs](../build/testing-and-docs.md)   |
| `complete:fix`                    | the same gate, with lint and formatting fixed rather than reported                                                                                                               | [Testing & Docs](../build/testing-and-docs.md)   |
| `test:replicas`                   | boots N separate copies of the app behind a proxy and asserts the state they share (rate-limit budget, session, idempotency, live frames, rolling restart); needs a Redis        | [Replicas testing](../build/replicas-testing.md) |
| `test:broker`                     | runs the queue adapter against a real RabbitMQ: topology, retry, parking, priority, prefetch, reconnect; needs a broker or a container engine                                    | [Broker Testing](../build/broker-testing.md)     |
| `complete:light:gates`            | `complete:light` minus lint and prettier, which the hook runs on staged files only via lint-staged                                                                               | [Testing & Docs](../build/testing-and-docs.md)   |
| `complete:light`                  | the fast subset behind pre-commit: every static check + the unit and cross-cutting suites; nothing that needs `mongod` (the hook adds `test:staged`), no `docs:build`            | [Testing & Docs](../build/testing-and-docs.md)   |
| `complete:manual`                 | what the gate cannot run for you: `test:prism`, `test:replicas` and `test:broker`, which bind real ports                                                                         | [Testing & Docs](../build/testing-and-docs.md)   |
| `bench`                           | k6 (pinned container) hitting one URL of a RUNNING server — `bench /orders` names the path, `/products` by default; `TOKEN=…` for a session route; reports numbers, no pass/fail | [Load Testing](../build/load-testing.md)         |
| `bench:k6`                        | ramping load with thresholds — passes or fails. `bench:k6 checkout` runs the write path (throwaway database only); `browse` by default                                           | [Load Testing](../build/load-testing.md)         |

## Test scripts

| Script               | Job                                                                                                                                            | Read more                                                         |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `test`               | run unit, cross-cutting, integration, contract, then fuzz                                                                                      | [Testing & Docs](../build/testing-and-docs.md)                    |
| `test:unit:report`   | the unit and cross-cutting runs again, writing `tmp/reports/test-report.json` for the reader below                                             | [Quick Start](../build/testing-quickstart.md)                     |
| `test:report`        | per-module rollup, slowest suites, failures named by module                                                                                    | [Quick Start](../build/testing-quickstart.md)                     |
| `test:unit`          | `tests/unit` plus each module's own `tests/unit` — logic below HTTP                                                                            | [Testing & Docs](../build/testing-and-docs.md)                    |
| `test:cross-cutting` | repo-wide invariants: locale parity, no hardcoded user text, every controller catches                                                          | [Testing & Docs](../build/testing-and-docs.md)                    |
| `test:integration`   | HTTP integration suite against a real database                                                                                                 | [Integration Testing](../build/integration-testing.md)            |
| `test:contract`      | validate real responses against `openapi.yaml`                                                                                                 | [Contract Testing](../build/contract-testing.md)                  |
| `test:fuzz`          | property/fuzz suite — a small pass in the gate, a deep pass in the nightly workflow                                                            | [Fuzz Testing](../build/fuzz-testing.md)                          |
| `test:staged`        | the staged integration/contract/fuzz test files, by file — the last step of the pre-commit hook                                                | [Testing & Docs](../build/testing-and-docs.md)                    |
| `test:order-random`  | integration, contract and fuzz in one process with `--randomize --showSeed` — hunts order dependence                                           | [Testing & Docs](../build/testing-and-docs.md)                    |
| `test:prism`         | run a quick Prism mock smoke test from `openapi.yaml`                                                                                          | [OpenAPI Workflow](../build/openapi-workflow.md)                  |
| `mutation`           | Stryker, scoped to the files this branch changed, graded against the baseline — every pull request                                             | [Mutation Testing](../build/mutation-testing.md)                  |
| `mutation:full`      | the whole repo, sharded, resumable across evenings — monthly in CI, or by hand                                                                 | [Mutation Testing](../build/mutation-testing.md)                  |
| `mutation:check`     | grade the last report against the committed per-file baseline; `-- --update` to record it                                                      | [Mutation Testing](../build/mutation-testing.md)                  |
| `mutation:pull`      | fetch the newest GitHub sweep's `mutation.json` into `tmp/reports/mutation/` and fold `mutation-baseline.json` from it (needs `gh auth login`) | [Mutation Testing](../build/mutation-testing.md#the-github-sweep) |
| `measure:scaffold`   | scaffold a module in a scratch copy and run the gate on it                                                                                     | [Module scaffolder](../build/module-scaffolder.md)                |

## Audit scripts

The deterministic half of the `code-shape` AI audit. Each writes a list for the audit to judge and
never fails — none is a gate.

| Script             | Job                                                                                   | Read more                                                                          |
| ------------------ | ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `audit:shallow`    | small functions with 1–2 users, pass-throughs, unused optional parameters, lazy files | [AI Auditing](../build/ai-auditing.md#code-shape-the-tools-count-the-model-judges) |
| `audit:unused`     | knip: unused files, exports, types and dependencies                                   | [AI Auditing](../build/ai-auditing.md#code-shape-the-tools-count-the-model-judges) |
| `audit:duplicates` | jscpd: copy-pasted and near-miss blocks, to `tmp/reports/audit/code-shape/jscpd/`     | [AI Auditing](../build/ai-auditing.md#code-shape-the-tools-count-the-model-judges) |

## Contract scripts

Two stages, and they run in this order: **bundle** the committed documents from their per-module
fragments, then **generate** code from the bundles. Full cheat sheet in [Regenerating After a
Change](../build/regenerating.md).

| Script                      | Stage    | Job                                                                                                                                                           | Read more                                                                     |
| --------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `contracts:bundle`          | bundle   | rebuild the bundles (`openapi.yaml`, `asyncapi.yaml`, `asyncapi.public.yaml`) from their fragments; name a target to narrow it                                | [Contract Fragmentation](../build/contract-fragmentation.md)                  |
| `gen:permission-vocabulary` | generate | `api/permission-vocabulary.ts` from `shared/authorization-keys.generated.yaml`; `regenerate` runs it before the first bundle                                  | [Permission Vocabulary](permission-vocabulary.md)                             |
| `gen:api`                   | generate | `rm -rf ./api`, then regenerate types + Zod schemas from `openapi.yaml` via orval, plus the error codes, the request content types and the permission actions | [OpenAPI Workflow](../build/openapi-workflow.md)                              |
| `gen:asyncapi`              | generate | regenerate `src/types/asyncapi.generated.ts` from `asyncapi.yaml`                                                                                             | [AsyncAPI Workflow](../build/asyncapi-workflow.md)                            |
| `lint:openapi`              | verify   | lint the bundled `openapi.yaml` with Spectral                                                                                                                 | [OpenAPI Workflow](../build/openapi-workflow.md)                              |
| `lint:openapi:modules`      | verify   | lint each `src/modules/*/openapi.yaml` **on its own**, against `shared/contracts/spectral.modules.yaml`                                                       | [Contract Fragmentation](../build/contract-fragmentation.md)                  |
| `lint:asyncapi`             | verify   | validate both bundles — `asyncapi.yaml` and `asyncapi.public.yaml`                                                                                            | [AsyncAPI Workflow](../build/asyncapi-workflow.md)                            |
| `lint:asyncapi:names`       | verify   | refuse British spellings in channel, message, schema, property and enum names of `asyncapi.yaml`, against `shared/contracts/spectral.asyncapi.names.yaml`     | [OpenAPI Workflow](../build/openapi-workflow.md#names-are-us-english-rule-n6) |
| `lint:asyncapi:modules`     | verify   | the same for each section document, against `shared/contracts/spectral.asyncapi.modules.yaml`                                                                 | [AsyncAPI Workflow](../build/asyncapi-workflow.md)                            |
| `sync:frontend`             | generate | copy the shared documents into the paired frontend checkout, so the spec-identity check can go green                                                          | [Contract Fragmentation](../build/contract-fragmentation.md)                  |
| `regenerate`                | generate | every generator, in dependency order, then the sync — the one command to run after changing a generator input; `-- --check` verifies                          | [Regenerating After a Change](../build/regenerating.md)                       |
| `check:generated`           | generate | the pre-commit hook's check: export the index, regenerate there, fail if a committed generated file changed; never stages                                     | [Regenerating After a Change](../build/regenerating.md#the-pre-commit-hook)   |

The `:modules` pair exists because each module's contract is a valid document on its own, so it can
be linted where it is written rather than only after bundling.

`contracts:bundle` is safe to run at any time: it compares before it writes and touches only the
bundles that actually drifted. A full run covers the authored bundles (`openapi.yaml` is one, though gitignored — see below),
never the client collections. The client
collections are generated from `openapi.yaml` and `.gitignore`d, so they are produced by name —
`npm run contracts:bundle -- bruno` — and `--check` refuses it, because an
uncommitted file cannot be stale.

`openapi.yaml`, `asyncapi.yaml`, `asyncapi.public.yaml`, `api/` (from `gen:api`), every `*.generated.ts`
(including `src/types/asyncapi.generated.ts`, from `gen:asyncapi`) are gitignored too, for the same
reason: `postinstall` rebuilds all of them automatically after `npm install`/`npm ci`, so there's
nothing committed left to go stale between them and the fragments they're built from — no freshness
check exists for any of them. What stays committed is checked by the pre-commit hook — see [Regenerating After a Change](../build/regenerating.md#the-generated-output-and-what-is-committed)
for exactly which is which.

## Docs scripts

| Script                                     | Job                                                 | Read more                                      |
| ------------------------------------------ | --------------------------------------------------- | ---------------------------------------------- |
| `docs:dev` / `docs:build` / `docs:preview` | local docs authoring, production build, and preview | [Testing & Docs](../build/testing-and-docs.md) |

The generated tables in `docs/` — the module graph, the role matrix, the dependency map, the
rate-limit budgets, the audit actions, the jobs — have no script of their own: `regenerate` writes
them and `check` verifies them. The list is in [Reference: Scripts](scripts.md).

## Database & seed scripts

`db:sync` owns **schema** (the indexes, reconciled against the schemas that declare them); the
seeder owns **demo data**. `db:bootstrap` chains them — it is what the compose `app` service runs
before starting the server.

`db:sync` is idempotent. The seeder is not, and cannot be: it seeds the catalogue and then builds
the order book by driving the real checkout, payment and shipping endpoints, so a second run over
the same database would give the shop a second history. It skips a database that already holds
anything and says so; `scenario:apply:reset` is how you rebuild on purpose.

| Script                 | Job                                                                                                                       | Read more                                                  |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `db:sync`              | add the indexes the schemas declare (never drops by surprise); `-- --check` plans, `-- --prune` also drops the undeclared | [Data](data.md)                                            |
| `scenario:apply`       | build the demo dataset (skipped if anything is present; refused outside `development`/`test`)                             | [Demo profile](../build/demo-profile.md)                   |
| `scenario:apply:reset` | empty the database and the rate-limit counters, then build it                                                             | [Demo profile](../build/demo-profile.md)                   |
| `db:cache:clear`       | drop every cached response under the app's prefix                                                                         | [Redis cache](../understand/redis-cache.md)                |
| `scenario:images`      | regenerate the seed thumbnails                                                                                            | [Demo profile](../build/demo-profile.md)                   |
| `scenario:tls`         | regenerate the webhook sink's TLS material (the development doubles trust it)                                             | [Demo profile](../build/demo-profile.md)                   |
| `db:bootstrap`         | the index sync with `--prune` (`db:sync` loads the development doubles) followed by `scenario:apply`                      | runs on container boot                                     |
| `access:bootstrap`     | upsert the shop row; no accounts, no demo data                                                                            | [Deployment hardening](../operate/deployment-hardening.md) |
| `deploy:setup`         | `db:sync` followed by `access:bootstrap` — a deployment's first run                                                       | [Deployment hardening](../operate/deployment-hardening.md) |
| `config:check`         | judge the environment and exit; `cron` runs it before its scheduler                                                       | [Health checks](../operate/health-checks.md)               |

`scenario:apply` calls `db:cache:clear`'s logic itself after building. Run the
script by hand after editing the database another way (`mongosh`, a GUI) — those writes never
reach the API, so nothing else invalidates the cache. See _Seeding and the response cache_ in the
repo README.

Any of them runs from the host through the `host` prefix — `npm run host -- scenario:apply:reset`. It
redirects the **hostname** to `127.0.0.1` via `cross-env`, by blanking `NODE_DB_URI` /
`NODE_REDIS_URL` so the resolvers fall through to `NODE_MONGODB_HOST` / `NODE_REDIS_HOST`, leaving
the port and the database name to `.env`. The literal address rather than the name `localhost`:
that name resolves to both `::1` and `127.0.0.1` in a resolver-decided order, and both engines
publish ports to IPv4 only, so the name intermittently reaches nothing at all. The shipped `.env` uses compose hostnames, so the bare
scripts only resolve from inside a container — see
[Running on the host instead](../build/run-locally.md#running-on-the-host-instead).

It deliberately does **not** spell out a URI. One that includes the database name overrides
`NODE_MONGODB_NAME` without saying so, and the script would seed a database nobody configured. It
is also deliberately **one** wrapper rather than a `:host` twin per script: copies of one
`cross-env` prefix drift apart.

## Container scripts

Four verbs, either engine. Use them instead of a bare `compose up`: they pick the engine and
read `CONTAINER_LOGS_PATH` from `.env`, which is what gives Alloy a host log path to tail.

| Script            | Job                                                                                                                                                                 | Read more                                                          |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `compose:up`      | start the stack detached                                                                                                                                            | [Docker & Podman](../build/docker-and-podman.md)                   |
| `compose:up:full` | start it with the `observability`, `analytics` and `docs` profiles                                                                                                  | [Docker & Podman](../build/docker-and-podman.md)                   |
| `compose:restart` | restart the compose stack                                                                                                                                           | [Docker & Podman](../build/docker-and-podman.md)                   |
| `compose:rebuild` | `down -v` (deletes the volumes, Mongo data included), rebuild every image with `--no-cache`, and start the stack                                                    | [Docker & Podman](../build/docker-and-podman.md)                   |
| `deploy:drill`    | deploy a good image, a broken one (refused, the first comes back) and a second good one, then `--rollback`, on the real production compose (needs Docker or Podman) | [Deploy and rollback](../operate/deploy-and-rollback.md#the-drill) |
| `backup:drill`    | build the backup image, back up a real replica-set Mongo, restore it, and prove the second machine refuses a delete (needs Docker; CI runs it)                      | [Backups](../operate/backups.md#the-restore-drill)                 |
| `compose`         | the bare compose invocation the others share; call it directly for one-off subcommands                                                                              | [Docker & Podman](../build/docker-and-podman.md)                   |

```bash
npm run compose -- logs -f app                   # any compose subcommand
CONTAINER_ENGINE=docker npm run compose:restart  # podman is the default
```

All of them expand to `${CONTAINER_ENGINE:-podman} compose`. Export `CONTAINER_ENGINE` in your shell
to switch — a **shell** variable, not a `.env` entry, because npm never reads `.env` and so never
sees what is written there. Compose does read it, which is why every other setting on this page can
live in `.env` and this one cannot.

## Maintenance & publishing scripts

| Script                       | Job                                                                                                                                                                             | Read more                                                                                          |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `setup`                      | first run: copies `.env-example` to `.env` if absent and fills the placeholder secrets                                                                                          | [First run](../operate/configuration.md#first-run-npm-run-setup)                                   |
| `refresh:breached-passwords` | rebuild the committed breached-password list the signup/password check reads (`scripts/security/refresh-breached-passwords.ts`)                                                 | [Breached passwords](../understand/defences/authentication.md)                                     |
| `scaffold:module`            | generate a new module's skeleton                                                                                                                                                | [Module scaffolder](../build/module-scaffolder.md)                                                 |
| `demo:remove`                | strip the `shop` and `example` modules and the demo scenarios from THIS checkout, to start a real project                                                                       | [Getting started: new project](../build/new-project.md)                                            |
| `postinstall`                | npm lifecycle hook — rebuilds the scenario registries, the authorization bundle, the shared rules, the bundles, `api/` and `asyncapi.generated.ts` after `npm install`/`npm ci` | [Regenerating After a Change](../build/regenerating.md#the-generated-output-and-what-is-committed) |
| `prepare`                    | npm lifecycle hook — installs the husky hooks after `npm install`                                                                                                               | not run by hand                                                                                    |

## Periodic jobs

`npm run job <name>` runs one scheduled job: `reap:*` (retention deletes) and `sweep:*` (retry and
repair loops), the names the production crontab uses. With no name it lists them. `reencrypt` is
run by hand against a deployment. The schedule table and what each one deletes live in
[Ops](ops.md).

## Related pages

- [Getting Started](../build/run-locally.md)
- [Regenerating After a Change](../build/regenerating.md)
- [Package Dependencies](./package-dependencies.md)
- [Docker & Podman](../build/docker-and-podman.md)
- [API](../build/api-contracts.md)
