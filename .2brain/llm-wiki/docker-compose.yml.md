---
source: docker-compose.yml
sha256: e26edc9b92e1013e4bc4f39bf10fefb6575bd8e47a0967ceb11f2c375e3722af
generated_at: 2026-10-14T06:46:53.898246+00:00
model: ollama:qwen3.8:27b
---

# docker-compose.yml

## Purpose

Orchestrates the local development stack: a single Node.js `app` service (API + seed data), its backing stores (`database`, `redis`, `limits`, `rabbitmq`), and optional observability/analytics services. All runtime configuration (ports, rate limits, worker count, analytics provider) is surfaced as `${VAR:-default}` overrides so that a live E2E run can tune values from the shell without editing `.env`.

## Key elements

- **`x-logging` (YAML anchor / alias)** – Sets the container log driver to `${CONTAINER_LOG_DRIVER:-json-file}`. Anchored once so every service writes log *files* that Promtail can tail; podman's default `journald` driver writes no file and silently breaks the Loki pipeline.
- **`services.app`** – The main Node.js container.
  - `build` – Builds from `docker/Dockerfile` with the repo root as context.
  - `ports` – Binds `${NODE_HOST:-127.0.0.1}:${NODE_PORT:-3000}` so the app is loopback-only unless explicitly exposed.
  - `environment` – Injects connection strings (Mongo, Redis ×2, RabbitMQ), clustering toggle, per-bucket rate limits, OTel endpoint, Loki/Umami/Faro host URLs (host-facing), and the analytics provider + Umami ingest host (service-name-facing). Every value has a shell-overridable default matching `.env`.
  - `volumes` – Bind-mounts the repo into `/app:Z` (hot reload); anonymous volume at `/app/node_modules` keeps installs host-independent.
  - `command` – Runs `npm run db:bootstrap` (schema sync + idempotent seeder) then either `dev:docker:cluster` or `dev:docker` depending on `NODE_ENABLE_CLUSTERING`.
  - `depends_on` – Waits for `database` to be **healthy** (not just started) before bootstrapping; `redis`, `limits`, and `rabbitmq` only need `service_started`.
  - `healthcheck` – Uses `node -e "fetch(...)"` against `/livez` because the alpine image lacks `curl`.
- **`services.scheduler`** (supercronic) – External cron runner sharing the `app` image; executes `scripts/ops/*` entry points. Keeps schedules as deployment config rather than compiled-in.
- **Truncated services** – `database`, `redis`, `limits`, `rabbitmq`, and observability/analytics containers are referenced by `depends_on` and env vars; their full definitions follow in the file.

## Relationships

- **`github/workflows/ci.yml`** – The CI pipeline starts this compose stack for integration and E2E test runs. The file's shell-overridable env vars (rate limits, `NODE_CLUSTER_WORKERS`) exist specifically so CI (or a local E2E session) can raise budgets via `NODE_RATE_LIMIT_MAX=… npm run compose:restart` without mutating `.env`. The `app` service is the unit under test; the backing services (`database`, `redis`, `limits`, `rabbitmq`) are its fixtures.

## Notes

- **Log driver is the #1 silent-failure trap.** On podman, omitting the `logging` key (or dropping the anchor) falls back to `journald`, which produces *no log file*. Promtail's glob then matches nothing, Loki is empty, and Grafana panels are blank with zero errors. Every service must carry the `*container-logging` alias.
- **Env-shadowing rule.** Anything listed in `environment` shadows `.env` for that key. Connection strings are intentionally *not* redeclared here (e.g., `NODE_MONGODB_HOST`) so an external URI can still be set via `.env`.
- **Seeder is not idempotent.** `db:bootstrap` skips seeding when the database is non-empty and exits 0. `scenario:apply:reset` is the deliberate reset path. The seeder also refuses `NODE_ENV=production`.
- **Two different "localhost" semantics.** `NODE_LOKI_HOST` / `NODE_UMAMI_HOST` / `NODE_FARO_COLLECTOR_URL` are *declarative* browser-facing URLs (use `localhost`). `NODE_UMAMI_INGEST_HOST` is *dialled* by the API inside the compose network (use the service name `umami`).
- **Healthcheck uses Node, not curl.** The `node:*-alpine` image has no `curl`; a curl-based check exits non-zero and parks the container on `unhealthy` while the API is fine.
- **Rate-limit buckets are a deliberate pair.** `NODE_AUTH_RATE_LIMIT_MAX` (per-account) and `NODE_AUTH_RATE_LIMIT_ADDRESS_MAX` (per-IP) must be raised together for a live E2E run; raising only one just moves which bucket trips. Never raise these in a deployed environment.
