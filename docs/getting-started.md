# Getting Started

From a fresh clone to a browsable API with demo data. Five minutes, four commands.

This stack is **container-first**: the shipped `.env` uses compose service hostnames, because the
things that make this boilerplate worth cloning — Tempo, Loki, Prometheus, Grafana, Alloy, Umami —
only exist inside the compose stack. Host mode is supported and has its own scripts; it is the
secondary path.

## First run

```bash
npm install
cp .env-example .env
# edit .env: set NODE_TOKEN_ACCESS and NODE_TOKEN_REFRESH to any two long random strings
npm run compose:restart          # or: npm run compose:restart
```

On Podman, also set `CONTAINER_LOGS_PATH`, `PROMTAIL_CONFIG` and `CONTAINER_LOG_DRIVER` in `.env`
(see `.env-example` → _Promtail Log Collection_). Nothing to set on Docker.

That is the whole setup. The `app` container runs `npm run db:bootstrap` before starting the server,
so the database is migrated and seeded on first boot — you get demo products, users and orders
rather than empty lists. Both halves are idempotent, so later boots are a no-op.

::: warning Use the scripts, not a bare `compose up`
Each script passes its runtime's Promtail override with `-f`, which is what gives Promtail a host
log path to tail. A bare `podman compose up` runs the base file only: Loki stays empty and Grafana's
log panels stay blank, with no error anywhere. `COMPOSE_FILE` in `.env` does not fix it —
podman-compose ignores it there.
:::

## Check it worked

```bash
curl http://localhost:3000/                          # health probe — also returns trace headers
curl http://localhost:3000/products                  # the seeded demo data
curl http://localhost:3000/observability/metrics      # Prometheus exposition
```

| What                | Where                    | Notes                             |
| ------------------- | ------------------------ | --------------------------------- |
| API                 | `http://localhost:3000`  | `NODE_PORT`                       |
| Grafana             | `http://localhost:3001`  | dashboards, logs, traces          |
| Docs (this site)    | `http://localhost:3090`  | or `npm run docs:dev` on the host |
| Prometheus          | `http://localhost:9090`  |                                   |
| RabbitMQ management | `http://localhost:15672` |                                   |
| Umami               | `http://localhost:3080`  |                                   |

The full list, and the env var for every port, is in
[Pairing & Ports](./tools/pairing-and-ports.md). This repo owns `3000–3099`; the paired frontend
owns `8080–8099`, which is what lets both stacks be up at once.

## Explore the API without writing a client

The repo root holds three generated collections — `contract.bruno.yml`, `contract.insomnia.json`
and `contract.mockoon.json` — with one request per
operation the contract declares, pre-filled with **values the seeded database actually holds**. Import
one and start clicking; `POST /account/login` already carries credentials that work.

They are generated, never hand-written, which is why they cannot rot. See
[Regenerating After a Change](./api/regenerating.md).

## Running on the host instead

`npm run dev` alone will **not** work against the shipped `.env`: the hostname `database` only
resolves inside the compose network. Prefix anything that reaches a datastore with
`npm run host --`, which redirects the hostnames to `127.0.0.1` and changes nothing else — start
the stack (or at least Mongo and Redis) first:

```bash
npm run host -- dev              # the API on the host, against the containerised database
npm run host -- db:bootstrap     # any script works the same way
npm run host -- db:seed:reset
npm run host -- db:cache:clear
```

Only the **hostname** moves. The database name, ports and everything else still come from your
`.env`, so there is no second env file to keep in sync — see
[Package Scripts](./tools/package-scripts.md#database--seed-scripts) for the mechanics.

The target is the literal `127.0.0.1`, not the name `localhost`, and that is not a style choice.
On a dual-stack machine `localhost` resolves to both `::1` and `127.0.0.1`, in an order the
resolver decides; docker and podman publish a port to `0.0.0.0`, which is IPv4 only. Where the
resolver answers with the IPv6 address first, the name reaches a port nothing is listening on, and
a container that is running and healthy refuses every connection — as `ECONNRESET`, or as a hang,
never as anything that says why.

## The one command before you commit

```bash
npm run complete     # build + all tests + lint + format check — ~60s
```

This is exactly what the pre-commit hook runs, so running it by hand only ever saves you a rejected
commit. Its mutating twin, `npm run complete`, fixes lint and formatting instead of reporting them.

Deliberately outside that gate, run by hand when you want them: `npm run test:mutation` (Stryker,
minutes), `npm run test:fuzz`, `npm run test:prism` (boots a mock server on a real port).

## Where to go next

| You want to                                 | Read                                                                  |
| ------------------------------------------- | --------------------------------------------------------------------- |
| Change an endpoint or a payload             | [OpenAPI Workflow](./api/openapi-workflow.md)                         |
| Know what to rerun after editing a fragment | [Regenerating After a Change](./api/regenerating.md)                  |
| Understand the folder layout                | [Theory / Modules](./theory/modules.md), [Layers](./theory/layers.md) |
| Find out what a dependency is doing here    | [Tools Explained](./tools/tools-explained.md)                         |
| Look up a script                            | [Package Scripts](./tools/package-scripts.md)                         |
| Run the paired frontend too                 | [Pairing & Ports](./tools/pairing-and-ports.md)                       |
