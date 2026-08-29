# docker-compose.yml

## Purpose

Orchestrates the full local development stack (Node.js API, MongoDB, Redis, RabbitMQ, OpenTelemetry Collector) as a single `docker compose up` command. It wires service discovery, shared networking, log-drivers compatible with the Promtail → Loki pipeline, and environment-specific defaults so the stack boots into a populated, health-checked, browsable state.

## Key elements

- **`x-logging` anchor** – Shared `logging` block (`json-file` by default, overridable via `CONTAINER_LOG_DRIVER`). Every service inherits it so Promtail's file-tail glob always matches.
- **`services.app`** – The Node.js API. Builds from `.docker/Dockerfile`, exposes `${NODE_PORT:-3000}`, runs `db:bootstrap` (migrate + seed) before starting the server. Exposes rate-limit knobs and observability URLs for shell-override during E2E runs.
- **`services.database`** – `mongo:8` with a named volume (`boilerplate_mongodb_volume`) and a `mongosh ping` healthcheck that `app`'s `depends_on` gates on.
- **`services.redis`** – `redis:7` cache with `allkeys-lru` eviction and a `maxmemory` cap; no persistent volume (cache-only).
- **`services.rabbitmq`** – Message broker (referenced in `depends_on`; full definition follows in the truncated portion).
- **`services.otel-collector`** – OTLP receiver at port 4318; the app's `OTEL_EXPORTER_OTLP_ENDPOINT` points here.
- **Healthchecks** – `app` uses `node -e "fetch(...)"` (no `curl` in alpine image); `database` uses `mongosh` ping. Both gate dependent startup order.
- **Volumes on `app`** – Bind-mount `.` to `/app:Z` for hot-reload; anonymous volume isolates `/app/node_modules`.

## Relationships

- **`docker/observability/`** – The `x-logging` anchor and `CONTAINER_LOG_DRIVER` override exist so that `loki.config.yaml` and the Promtail config in this directory can tail the files Docker/podman actually writes. `grafana.datasources.yaml` and `grafana.dashboard-providers.yaml` consume the metrics/logs emitted through the `otel-collector` and Loki services defined here. `alertmanager.config.yaml` alerts on the same metrics.
- **`docker-compose.production.yml`** – Production variant of this file; the rate-limit and `NODE_ENV` defaults declared here are intentionally *not* carried forward there.
- **`asyncapi.yaml`** – Describes the RabbitMQ message contracts that the `rabbitmq` service in this stack brokers.
- **`docs/reference/ops.md`** – Documents the operator-facing commands (`compose:restart`, log inspection) that assume the service names and ports defined here.

## Notes

- **Logging driver is non-negotiable for the stack.** Podman defaults to `journald`, which writes no file; Promtail tails a glob that then matches nothing, and Loki/Grafana go silent with no error. The anchor forces `json-file` (or the CRI-compatible `k8s-file`) on *every* service—missing it on one service silently drops that service from logs.
- **Rate-limit env vars are shell-overridable by design.** `NODE_RATE_LIMIT_MAX`, `NODE_AUTH_RATE_LIMIT_MAX`, and `NODE_AUTH_RATE_LIMIT_ADDRESS_MAX` default to the same values as `.env` but are declared in compose so an E2E run can raise them without editing `.env`. Never raise them in a deployed environment.
- **`NODE_DB_URI` must come from `.env`.** It is deliberately *not* listed in the `environment` block; adding it there would shadow `.env` and prevent pointing at an external Mongo.
- **`NODE_UMAMI_HOST` vs `NODE_UMAMI_INGEST_HOST`.** The former is a host-facing URL (browser-reachable, uses `localhost`); the latter is a service-to-service URL (uses the compose service name `umami`). Confusing them breaks analytics ingestion.
- **Healthcheck uses `node -e` with `fetch`**, not `curl`, because the base image is `node:*-alpine` and lacks `curl`.
