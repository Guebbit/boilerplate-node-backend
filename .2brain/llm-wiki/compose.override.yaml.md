---
source: compose.override.yaml
generated_at: 2026-11-22T01:26:16.131946+00:00
model: claude-code:claude-sonnet-5-5
---

# compose.override.yaml

## Purpose
Development-time Compose override layered on top of `compose.yaml`. It defines the dev configuration of the `app` service (dev build stage, bind-mounted source, hot reload, seeded database, dev-friendly environment) and a shared container log-driver setting so Alloy can read container logs from files. The file shown also begins defining an external-scheduler service that runs the same image as `app`. That service's definition is not fully visible here.

## Key elements
- **`x-logging` / `&container-logging`**: YAML anchor setting `driver: ${CONTAINER_LOG_DRIVER:-json-file}`. Podman's default `journald` writes no log file, so Alloy would tail nothing and Grafana log panels would be blank. The comment names `k8s-file` as the podman file-based alternative. Every service needs the same driver, because Alloy scrapes the whole directory.
- **`app` service**:
  - `build.target: dev`. The `context` and `dockerfile` live in `compose.yaml`.
  - `restart: 'on-failure:5'`, so a boot refusal ends as `Exited (1)` instead of looping silently.
  - `ports`: `${NODE_HOST:-127.0.0.1}:${NODE_PORT:-3000}:${NODE_PORT:-3000}`, loopback by default.
  - `environment`:
    - `NODE_ENV=development`.
    - Redis URLs: `NODE_REDIS_URL` points at `cache`, and `NODE_RATE_LIMIT_REDIS_URL` points at the `limits` instance.
    - RabbitMQ URL: `NODE_RABBITMQ_URL` points at `queue`.
    - Three overridable rate-limit buckets: `NODE_RATE_LIMIT_MAX` (100), `NODE_AUTH_RATE_LIMIT_MAX` (10) and `NODE_AUTH_RATE_LIMIT_ADDRESS_MAX` (30).
    - Observability: `OTEL_EXPORTER_OTLP_ENDPOINT` (empty by default), `NODE_SERVICE_NAME`, and the declarative `NODE_LOKI_HOST`, `NODE_UMAMI_HOST` and `NODE_FARO_COLLECTOR_URL`.
    - Analytics: `NODE_ANALYTICS_PROVIDER` (default `none`), `NODE_UMAMI_INGEST_HOST` (`http://umami:3000`) and `NODE_UMAMI_WEBSITE_ID`.
  - `volumes`: bind mount `.:/app:Z`, plus an anonymous `/app/node_modules` volume.
  - `command`: runs `docker/ensure-deps.sh`, then `npm run db:bootstrap` (index sync plus seeder), then `npm run dev:docker`.
  - `depends_on`: `database` (`service_healthy`), and `cache`, `limits` and `queue` (`service_started`).
  - `healthcheck`: `node -e fetch(.../livez)`, with `interval: 2m`, `timeout: 5s`, `retries: 3` and `start_period: 30s`.
- **Scheduler service (partially visible)**: comments describe an external scheduler that uses the same image as `app` and runs supercronic against `docker/crontab`. It is meant to run with `replicas: 1`, alongside a Mongo lease for mutual exclusion. Its definition is not visible in the shown content.

## Relationships
- **`compose.yaml`**: the base file. This override only sets `build.target` for `app`, and the comments say `context` and `dockerfile` live in `compose.yaml`. It also references services (`database`, `cache`, `limits`, `queue`, and the Loki, Umami and Alloy containers) and the `database` volume, which the comments imply are defined alongside it. It also mentions the `observability` and `analytics` profiles as opt-in.
- **`docker/observability/prometheus.config.yaml`**: no direct reference is visible in the shown content. The relationship is only through the shared observability stack. `OTEL_EXPORTER_OTLP_ENDPOINT` sends traces to the OTel Collector, which fans out to backends.

## Notes
- The `app` service environment deliberately omits the Mongo connection. An entry here would shadow `.env` and block setting an external `NODE_DB_URI`.
- `db:bootstrap` seeds well-known demo credentials on every boot (`root@root.it` / `Demo-Admin1!` unless every `NODE_SEED_*_PASSWORD` is set). The loopback port binding is the safeguard. Setting `NODE_HOST=0.0.0.0` or a LAN IP exposes it.
- The rate-limit variables exist so a live E2E run can raise them from the shell, for example `NODE_RATE_LIMIT_MAX=1000 npm run compose:restart`. The file says never to raise them in a deployed environment.
- The healthcheck uses Node's `fetch` because the alpine image ships no `curl`. It tests liveness (`/livez`), not dependencies.
- `NODE_LOKI_HOST`, `NODE_UMAMI_HOST` and `NODE_FARO_COLLECTOR_URL` are host-facing URLs that are never called by the app. `NODE_UMAMI_INGEST_HOST` uses a service name because the API dials it from inside the compose network.
- Changing `.env` values requires a rebuild to take effect.
