---
source: docker-compose.yml
sha256: 0910f0592664c68ce2beaaeac109cd72460c75c04b96ba1b38eeee2e60844e8c
generated_at: 2026-09-23T17:12:16.400248+00:00
model: ollama:qwen3.8:27b
---

# docker-compose.yml

## Purpose

Defines the local development stack for the Node.js API and its supporting services (Mongo, Redis, RabbitMQ, OTel Collector, Umami, Promtail/Loki/Grafana). It exists so a developer can boot a fully wired, seeded environment with a single `compose up`, and so observability/health endpoints report truthfully about what is actually running.

## Key elements

- **`x-logging` (YAML anchor `&container-logging`)** — Shared log-driver setting (default `json-file`, overridable via `CONTAINER_LOG_DRIVER`). Anchored so every service writes to a file that Promtail can tail; podman's `journald` default would silently leave Loki empty.
- **`services.app`** — The Node.js API container.
  - Built from `docker/Dockerfile`; context is the repo root.
  - `command`: runs `npm run db:bootstrap` (idempotent index sync + one-shot seeder) then the dev server, switching to cluster mode when `NODE_ENABLE_CLUSTERING=1`.
  - Environment injects Redis, RabbitMQ, OTel, rate-limit budgets, observability host URLs, and Umami ingest settings. Defaults mirror `.env-example`; several values (rate limits, cluster workers) are deliberately declared here so a shell `npm run compose:restart` can override them without editing `.env`.
  - `depends_on`: `database` uses `service_healthy` (bootstrap needs Mongo accepting connections); Redis, RabbitMQ, and otel-collector use `service_started`.
  - `healthcheck`: `node -e` + built-in `fetch` (image is alpine, no curl). 2 min interval, 3 retries, 30 s start period.
  - Volumes: bind-mount `./` → `/app` (hot reload), anonymous volume for `/app/node_modules`.
- **`services.scheduler`** (truncated) — External cron runner using busybox `crond` in foreground, same image as `app`. Keeps job schedules as deployment config rather than in-process `node-cron`; shape maps to a K8s `CronJob` or systemd timer.
- **Referenced services** (defined elsewhere in the same file or a `docker-compose.*.yml`): `database` (Mongo), `redis`, `rabbitmq`, `otel-collector`, `umami`, `promtail`, `loki`, `grafana`, `alloy`.

## Relationships

- **`github/workflows/ci.yml`** — CI validates or boots this compose stack (e.g. `docker compose up` / `podman compose up`) before running the frontend E2E suite against the API. The rate-limit and cluster-worker env vars that are overridable at the shell level exist partly so the CI job can raise them without a separate env file.

## Notes

- The `NODE_DB_URI` is intentionally **not** set in the `environment` block; it comes from `.env` and must point at the `database` service hostname. Adding it here would shadow `.env` and make an external/Atlas URI impossible without editing this file.
- `NODE_UMAMI_HOST` (localhost, browser-facing, declarative) and `NODE_UMAMI_INGEST_HOST` (service name `umami`, API-dialled) are different values for different consumers—do not "unify" them.
- The seeder is **not** idempotent; it skips a non-empty DB. To rebuild demo data use `scenario:apply:reset`, not a re-run of `db:bootstrap`.
- The healthcheck uses `node -e` specifically because the alpine base image has no `curl`; a `curl -f` test exits non-zero and parks the container on `unhealthy` while the API is fine.
- `NODE_AUTH_RATE_LIMIT_MAX` and `NODE_AUTH_RATE_LIMIT_ADDRESS_MAX` form a **pair** (per-account + per-address). Raising only one just shifts which bucket a load run trips over; raise both together.
- Podman vs Docker log-driver difference is the single most common cause of "Grafana log panels are blank with no error" in this stack.
