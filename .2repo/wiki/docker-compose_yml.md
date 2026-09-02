# docker-compose.yml

## Purpose

Development Docker/Podman Compose stack that orchestrates the Node.js API, MongoDB, Redis, RabbitMQ, an OTel Collector, and the local observability tooling (Promtail, Loki, Grafana, Umami, Alloy/Faro) into a single `compose up`-able environment. It is the dev-only counterpart to `docker-compose.production.yml`.

## Key elements

- **`x-logging` (YAML anchor `&container-logging`)** — Shared `logging.driver` block (default `json-file`, overridable via `CONTAINER_LOG_DRIVER`). Every service references it via `*container-logging` so Promtail can tail log files for Loki. Without it, Podman's `journald` default writes no file and the whole log pipeline silently produces nothing.
- **`services.app`** — The API container. Builds from `.docker/Dockerfile`; runs `npm run db:bootstrap` (migrate + seed, both idempotent) then the dev server (cluster mode optional via `NODE_ENABLE_CLUSTERING`). Exposes rate-limit and analytics env vars with shell-overridable defaults for E2E runs. Healthcheck uses `node -e` + `fetch` (the alpine image ships no `curl`).
- **`services.database`** — `mongo:8` with a `mongosh` ping healthcheck that `app` gates on via `depends_on: service_healthy`. Data persisted to named volume `boilerplate_mongodb_volume`.
- **`services.redis`** — `redis:7` used as a TTL-bound in-memory cache (data lost on restart by design). `maxmemory` is set to prevent unbounded growth.
- **`services.rabbitmq`** — AMQP broker; app connects via `NODE_RABBITMQ_URL`.
- **`services.otel-collector`** — OTLP endpoint for trace export; `app` depends on it starting.
- **Volumes on `app`** — Bind-mount `./app:Z` (hot-reload source) + anonymous `/app/node_modules` (isolates `node_modules` from host).

## Relationships

- **`docker-compose.production.yml`** — Production variant of this stack; same service topology, hardened env, no dev-only mounts or bootstrap seeding.
- **`asyncapi.yaml`** — Message contract that the RabbitMQ service and the app's AMQP client implement; `app` publishes/subscribes to the topics defined there.
- **`docker/observability/loki.config.yaml`** — Loki instance whose ingestion depends on the `json-file` log driver this file enforces; Promtail tails the resulting files.
- **`docker/observability/grafana.datasources.yaml`** — Datasource definitions (Loki, Tempo, etc.) that Grafana loads; the log panels Grafana renders are fed through the path this file's logging driver makes possible.
- **`docker/observability/grafana.dashboard-providers.yaml`** — Dashboard provisioning for the Grafana instance in this stack.
- **`docker/observability/alertmanager.config.yaml`** — Alert routing config for the Alertmanager instance in this stack.

## Notes

- **`NODE_DB_URI` is intentionally absent** from the `app` environment block. It arrives from `.env`; redeclaring it here would shadow an external/Atlas URI and break portability.
- **`NODE_UMAMI_HOST` (localhost) vs `NODE_UMAMI_INGEST_HOST` (service name)** — The former is declarative metadata for `/observability/health`; the latter is a real dial target from inside the compose network. Confusing them makes the health endpoint report a wrong URL or the API fail to reach Umami.
- **Rate-limit vars (`NODE_RATE_LIMIT_MAX`, `NODE_AUTH_RATE_LIMIT_MAX`, `NODE_AUTH_RATE_LIMIT_ADDRESS_MAX`)** are exposed as env vars solely so a live E2E run can raise them from the shell without editing `.env`. The two credential buckets form a pair — raising only one shifts which limit the run trips. Never raise them in a deployed environment.
- **Healthcheck uses `node -e` + `fetch`**, not `curl`, because the `node:*-alpine` base image does not include `curl`. A `curl`-based check would park the container as `unhealthy` while the API was actually serving 200.
- **`db:bootstrap` seeder refuses to run when `NODE_ENV=production`**, so the dev-only seed data never leaks into a prod stack.
- **Podman users:** if `CONTAINER_LOG_DRIVER` is unset, the `json-file` default in this file is what makes the observability pipeline work. Removing or overriding it to `journald` silently empties Loki and Grafana with no error.
