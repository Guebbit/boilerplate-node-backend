# Getting Started — Production

The deployment shape of this stack, not the development one. `docker-compose.yml` bind-mounts the
working tree and brings up the whole observability estate because seeing everything is the point
of a dev box. `docker-compose.production.yml` is the other half: it runs the **built** image, binds
the API port to loopback only, and stops at the four services the application cannot run without.

::: warning Read this alongside the file, not instead of it
Every decision below — why the port is loopback-only, why clustering is off, why observability is
absent — is explained inline in `docker-compose.production.yml` and `.docker/Dockerfile.production`
themselves. This page is the short version; the compose file is the source of truth.
:::

## First run

```bash
cp .env-example .env
```

Then edit `.env`. Three groups of values need real ones before the first deploy:

| Variable                                  | Why                                                                                                                                                                          |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NODE_TOKEN_ACCESS`, `NODE_TOKEN_REFRESH` | JWT signing secrets. Any two long random strings — never the example values.                                                                                                 |
| `NODE_METRICS_TOKEN`                      | Bearer credential a scraper needs to read `/observability/metrics`.                                                                                                          |
| `MONGO_PASSWORD`, `RABBITMQ_PASSWORD`     | Not in `.env-example` at all — dev Mongo runs unauthenticated. Add both yourself; the compose file refuses to start without `MONGO_PASSWORD` (`RABBITMQ_PASSWORD` the same). |

`MONGO_USER` and `MONGO_DB` default to `api` if left unset; `RABBITMQ_USER` defaults to `guest`.

```bash
docker compose -f docker-compose.production.yml up -d --build
```

That builds `.docker/Dockerfile.production` (multi-stage: type-checks and lints in a build stage,
ships only production dependencies in the runtime stage) and starts the API plus `database`,
`cache` and `queue` — the production names for Mongo, Redis and RabbitMQ. No bind mount, no hot
reload: what's running is exactly what was built.

## Check it worked

```bash
docker compose -f docker-compose.production.yml logs -f app
curl http://127.0.0.1:3000/          # health probe
```

The port is published to `127.0.0.1`, not `0.0.0.0` — reachable from the host, not from the
network. That is deliberate, see [Putting a reverse proxy in front](#putting-a-reverse-proxy-in-front) below.

## What's different from dev

| Dev (`docker-compose.yml`)                                  | Production (`docker-compose.production.yml`)                            |
| ----------------------------------------------------------- | ----------------------------------------------------------------------- |
| Source bind-mounted, `tsx` watches for changes              | Source baked into the image at build time                               |
| API port published to all interfaces                        | API port published to `127.0.0.1` only                                  |
| Full observability stack included                           | No observability containers — see [below](#observability-in-production) |
| `NODE_ENABLE_CLUSTERING=1` (multi-process in one container) | `NODE_ENABLE_CLUSTERING=0` — one process per container, always          |
| Runs as whatever user starts compose                        | Runs as the non-root `node` user inside the image                       |
| Mongo has no auth                                           | Mongo requires `MONGO_USER` / `MONGO_PASSWORD`                          |

Clustering is off on purpose: scale replicas with `--scale app=N` or an orchestrator instead, so
one thing decides how many processes are live, not two layers of process management fighting a
rolling deploy.

## Putting a reverse proxy in front

Nothing in this repo terminates TLS. The API is bound to loopback specifically so that publishing
it on a public interface — plain HTTP, carrying the auth cookies this application sets — is not the
easy path. Put nginx, Caddy, Traefik or a managed load balancer in front, terminate TLS there, and
proxy to `127.0.0.1:${NODE_PORT}`.

## Uploaded images do not outlive the container

`imageStore` (`src/infrastructure/adapters/image-store.ts`) writes uploads to disk. The compose
file mounts a named volume (`uploads:/app/public/images`) as the stopgap — without it, a redeploy
loses every uploaded image. The volume still pins the deployment to one host, and two replicas do
not share what they store. The durable answer is an S3-compatible `ImageStore` implementation;
nothing selects a backend yet, on purpose.

## Observability in production

The dev stack's Prometheus, Loki, Tempo, Grafana and OTel Collector are **not** in the production
file, because a real deployment usually points at a collector it already runs rather than hosting
one next to the API. Set `OTEL_EXPORTER_OTLP_ENDPOINT` to that collector; an empty value is a valid
choice and simply means no traces leave the process.

To run the same observability estate here anyway, the service definitions already exist — copy the
ones you want from `docker-compose.yml` into your own override file rather than layering the two
compose files directly (`-f docker-compose.production.yml -f docker-compose.yml` drags the dev
bind-mounts back in).

See [Docker & Podman](./tools/docker-and-podman.md) for what each of those containers does and
[Observability Reference](./tools/observability-reference.md) for how the app talks to them.

## Where to go next

| You want to                                       | Read                                            |
| ------------------------------------------------- | ----------------------------------------------- |
| Run the dev stack instead                         | [Getting Started](./getting-started.md)         |
| Understand every container, dev or production     | [Docker & Podman](./tools/docker-and-podman.md) |
| See every host port and its env var               | [Pairing & Ports](./tools/pairing-and-ports.md) |
| Understand graceful shutdown under SIGTERM        | [Clustering & Shutdown](./theory/clustering.md) |
| Look up a file in `.docker/` or the compose files | [Ops & Assets](./reference/ops.md)              |
