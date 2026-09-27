---
source: docker-compose.yml
sha256: 929bd07dc2248a9fa249a298112622a5867b8cd41e4bc58ab2276d0062bde417
generated_at: 2026-09-27T13:47:18.975702+00:00
model: ollama:qwen3.8:27b
---

# docker-compose.yml

## Purpose
Defines the local multi-container development stack (app, database, Redis, RabbitMQ, scheduler, observability, and optional analytics services) for a Node.js application. It encapsulates build context, service wiring, runtime environment, volume layout, health checks, and a logging-driver anchor so that a single `compose up` yields a fully populated, observable, browsable environment without manual setup.

## Key elements
- **`x-logging` anchor** — YAML anchor (`&container-logging`) that pins the container log driver to `json-file` (overridable via `CONTAINER_LOG_DRIVER`). Required because Promtail tails log files; Podman's default `journald` driver writes no file, silently breaking Loki ingestion.
- **`services.app`** — The Node.js API container. Built from `docker/Dockerfile`, bound to `${NODE_HOST:-127.0.0.1}:${NODE_PORT:-3000}`, with `restart: unless-stopped`. Carries all runtime env vars (Mongo/Redis/RabbitMQ URLs, clustering, rate-limit buckets, OTel endpoint, Loki/Umami/Faro health URLs, analytics provider config). Command runs `npm run db:bootstrap` (idempotent sync + one-shot seeder) then starts the dev server in cluster or single-process mode.
- **`services.app.volumes`** — Bind-mounts `.` → `/app:Z` for hot-reload; anonymous volume isolates `/app/node_modules` from the host.
- **`services.app.depends_on`** — `database` gated on `service_healthy` (Mongo must accept connections before `db:bootstrap` runs); `redis` and `rabbitmq` gated on `service_started`.
- **`services.app.healthcheck`** — Uses `node -e` with built-in `fetch` (the alpine image ships no `curl`). 2-min interval, 5 s timeout, 3 retries, 30 s start period.
- **Scheduler service** (supercronic) — External cron via `docker/crontab` bind-mounted at `/app/crontab`; uses the same image as `app`. `replicas: 1` plus a Mongo lease (`src/infrastructure/persistence/lease.ts`) provide mutual exclusion. Shape mirrors a Kubernetes `CronJob` or systemd timer.
- **Rate-limit env vars** (`NODE_RATE_LIMIT_MAX`, `NODE_AUTH_RATE_LIMIT_MAX`, `NODE_AUTH_RATE_LIMIT_ADDRESS_MAX`) — Defaults match `.env`; declared here so a live E2E run can override them from the shell without editing `.env`. Credential buckets are intentionally decoupled from the global bucket.

## Relationships
- **`github/workflows/ci.yml`** — The CI workflow drives this compose stack for integration/E2E test runs. It relies on the same `compose:restart` script and the shell-overridable rate-limit / cluster-worker variables declared here to raise budgets for a single-address test suite without touching `.env`. The healthcheck and `depends_on` ordering in this file are what CI polls before asserting the API is ready.

## Notes
- **Logging driver is not optional.** Every service must inherit the `x-logging` anchor; omitting it on any one service makes that service invisible to Promtail with no error surfaced anywhere.
- **`NODE_ENV` is hard-pinned to `development`.** The seeder refuses to run in production, but this pin also gates the one seeder check it *does* refuse. Changing it here changes bootstrap behavior, not just env labels.
- **Mongo connection is intentionally absent from the `environment` block.** It comes from `.env` (`NODE_MONGODB_HOST` / `NODE_DB_URI`). Adding it here would shadow `.env` and block external URIs.
- **Loki/Umami/Faro URLs in `NODE_LOKI_HOST` etc. use `localhost`, while `NODE_UMAMI_INGEST_HOST` uses the service name.** The former are declarative (reported to a browser via `/observability/health`); the latter is dialled from inside the compose network where `localhost` is the app's own container.
- **The seeder is non-idempotent** — it builds order history by driving real checkouts and skips if the database already contains data. `scenario:apply:reset` is the intended way to rebuild.
- **`NODE_ENABLE_CLUSTERING=0` is the default** (one process). On many-core machines this prevents dozens of Node workers during a solo dev session; set to `1` for load testing.
