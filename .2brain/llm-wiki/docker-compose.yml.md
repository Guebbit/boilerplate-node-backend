---
source: docker-compose.yml
sha256: 2fe7c2bb35e8aaf843d219794aace7214732b7d87e491778cfc60399342877d4
generated_at: 2026-10-29T01:17:41.079807+00:00
model: ollama:qwen3.8:27b
---

# docker-compose.yml

## Purpose

Defines the local (and CI) container stack for the Node.js API and its backing services. It wires together the app, database, caches, message broker, and optional observability/analytics services into a single `compose up` experience that is hot-reloadable, seeded with demo data, and compatible with both Docker and Podman.

## Key elements

- **`x-logging` anchor** — Shared log-driver config (`json-file` default, overridable via `CONTAINER_LOG_DRIVER`). Applied to every service so Promtail's file-glob always matches. Critical for Podman, whose default `journald` driver writes no file.
- **`services.app`** — The API container. Builds from `docker/Dockerfile`, binds the host `.` to `/app` (hot reload), isolates `node_modules` in an anonymous volume, and runs `npm run db:bootstrap` before starting the dev server (or cluster mode).
- **Rate-limit env vars** (`NODE_RATE_LIMIT_MAX`, `NODE_AUTH_RATE_LIMIT_MAX`, `NODE_AUTH_RATE_LIMIT_ADDRESS_MAX`) — Declared here with `.env`-matching defaults so an E2E run can raise them from the shell without editing `.env`. Credential budgets are a deliberate pair; widening one without the other just shifts which bucket trips first.
- **Observability / analytics env vars** — `OTEL_EXPORTER_OTLP_ENDPOINT`, `NODE_LOKI_HOST`, `NODE_UMAMI_HOST`, `NODE_FARO_COLLECTOR_URL`, `NODE_ANALYTICS_PROVIDER`, `NODE_UMAMI_INGEST_HOST`. The `_HOST`/`_URL` values are host-facing (browser-reachable); the `_INGEST_HOST` is a compose-network service name because the API dials it from inside the stack.
- **`depends_on`** — `database` uses `service_healthy` (bootstrap needs a live connection); `redis`, `limits`, `rabbitmq` use `service_started`.
- **`healthcheck`** — Uses `node -e` with built-in `fetch` against `/livez` because the node-alpine image has no `curl`. 2 min interval, 30 s start period.
- **`command`** — Shell one-liner that bootstraps the DB, then branches on `NODE_ENABLE_CLUSTERING` to pick `dev:docker` vs `dev:docker:cluster`.
- **Truncated `scheduler` service** (supercronic) — Runs ops scripts (`reap-*`, `sweep:*`) from the same image as `app`, keeping the schedule as deployment config rather than in-process cron.

## Relationships

- **`github/workflows/ci.yml`** — The CI pipeline exercises this compose stack (build, up, health-check, test) as its integration/E2E harness. Changes to service names, port bindings, or env-var defaults here must stay in sync with the workflow's `compose` commands.

## Notes

- **Podman log-driver gotcha:** Podman's default is `journald`, which writes no log file. Without the `x-logging` anchor (or `CONTAINER_LOG_DRIVER=k8s-file`), Promtail tails an empty glob and Loki/Grafana silently show nothing.
- **`.env` shadowing:** Any key listed under `environment:` in this file *shadows* the same key in `.env`. The Mongo connection string is intentionally *not* declared here so an external `NODE_DB_URI` in `.env` still works.
- **Seeder idempotency:** `db:bootstrap` runs `db:sync` (idempotent) then a seeder that *skips* any non-empty database. A fresh `compose up` yields a populated stack; a later boot won't duplicate data. `scenario:apply:reset` is the intentional reset path.
- **Rate-limit pair:** `NODE_AUTH_RATE_LIMIT_MAX` (per-account) and `NODE_AUTH_RATE_LIMIT_ADDRESS_MAX` (per-IP) must be raised together for E2E runs; raising only one just moves the 429 to the other bucket.
- **`NODE_CLUSTER_WORKERS=0`** means "one per CPU core." On many-core machines this spawns a lot of Node processes for local traffic; set `NODE_CLUSTER_WORKERS=1` for a single-worker E2E run.
- **`NODE_ANALYTICS_PROVIDER`** defaults to `none`. The `umami` or `posthog` profile is opt-in; the ingest host uses the compose service name (`umami:3000`), not `localhost`, because the API resolves it from inside the network.
