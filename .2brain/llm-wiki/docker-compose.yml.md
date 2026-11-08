---
source: docker-compose.yml
sha256: a369342a790eabb0db2ce40c56f54c7d8bc694372a1964404bc175e42dcee74b
generated_at: 2026-11-08T02:17:46.134434+00:00
model: ollama:qwen3.8:27b
---

# docker-compose.yml

## Purpose

Defines the full local development stack (app, database, caches, queue, scheduler, and optional observability/analytics services) for a single `docker compose up`. It wires the Node.js `app` service to its dependencies, injects every runtime environment variable with sensible defaults, and ensures a fresh boot yields a populated, browsable stack via `db:bootstrap`.

## Key elements

- **`x-logging` YAML anchor** — Shared log-driver override (`json-file` default, `k8s-file` for Podman) applied to every service so Promtail can tail the log files on disk.
- **`services.app`** — The main Node.js container: builds from `docker/Dockerfile`, bind-mounts `.` into `/app` with an anonymous volume for `node_modules`, runs `db:bootstrap` then `dev` or `dev:cluster`, and exposes `${NODE_HOST}:${NODE_PORT}` (loopback by default).
- **`services.app.environment`** — All runtime config: Mongo/Redis/RabbitMQ URLs, cluster worker count, per-IP and per-account rate-limit budgets, OTel endpoint, Loki/Umami/Faro host URLs, analytics provider and ingest host. Every value is `${VAR:-default}` so a shell env or `.env` can override without editing this file.
- **`services.app.depends_on`** — Waits for `database` to report healthy (not just started) and for `redis`, `limits`, `rabbitmq` to be started.
- **`services.app.healthcheck`** — Liveness probe hitting `/livez` via `node -e "fetch(...)"` (the Alpine image ships no `curl`).
- **`services.app.command`** — `sh -c 'npm run db:bootstrap && …'` — runs idempotent index sync + one-time seeder, then starts the server in clustered or single-process mode based on `NODE_ENABLE_CLUSTERING`.
- **`services.app.volumes`** — Bind mount `.: /app:Z` for hot reload; anonymous volume at `/app/node_modules` so host `node_modules` are not shadowed.
- **Scheduler service (supercronic)** — External cron runner using the same image as `app`; runs `scripts/ops/reap-*` and `sweep:*` jobs on a schedule defined in `docker/crontab`.

## Relationships

- **`docker/Dockerfile`** — Referenced by `build.dockerfile`; supplies the base image, installed dependencies, and all `scripts/*` entry points the `command` and scheduler service invoke.
- **`docker-compose.production.yml`** — Production overlay that reuses this file's service definitions while pinning `NODE_ENV=production`, stripping the seeder, and adjusting restart/logging policy.
- **`docker-compose.test.yml`** — Test overlay; likely narrows services and disables the seeder/observability profiles.
- **`docker/crontab`** — Read by the supercronic scheduler service to determine which ops scripts to run and when.
- **`docs/tools/health-checks.md`** — Documents the `/livez` vs `/readyz` distinction that the healthcheck and `depends_on` logic rely on.
- **`docs/reference/ops.md`** — Explains the scheduled-jobs architecture (supercronic) that the scheduler service implements.
- **`src/infrastructure/persistence/lease.ts`** — Consumer of the `limits` Redis instance (`NODE_RATE_LIMIT_REDIS_URL`), which this file declares as a separate container from the primary `redis`.
- **`scenarios/support/development-doubles.ts`** — E2E test doubles that depend on the rate-limit and analytics settings exposed here (raising `NODE_RATE_LIMIT_MAX` etc. in the shell before `compose:restart`).

## Notes

- **Logging driver is the single most common "silent failure"**: Podman defaults to `journald`, which writes no file Promtail can tail. The `x-logging` anchor with `${CONTAINER_LOG_DRIVER:-json-file}` is the fix; forgetting to set the variable under Podman yields blank Grafana log panels with no error.
- **Rate-limit variables are deliberately split into three decoupled buckets** (global, per-account credential, per-address credential). Raising only the global one does not widen the credential budgets, and vice-versa. The comments explicitly warn never to raise them in a deployed environment.
- **`NODE_ENV` is pinned to `development`** in this file (overriding any `.env`), which is the gate that lets `db:bootstrap`'s seeder run. The production overlay must change it.
- **`NODE_MONGODB_HOST` is intentionally *not* set here** so that `NODE_DB_URI` from `.env` can point at an external Mongo. Adding it here would shadow that path.
- **Analytics host uses the service name (`umami:3000`)**, not `localhost`, because the API dials it from inside the compose network. The *declarative* health-endpoint URLs (`NODE_UMAMI_HOST`, `NODE_LOKI_HOST`, etc.) use `localhost` because they describe what a browser reaches.
- **The seeder is not idempotent**: it skips a non-empty database and exits 0. Use `scenario:apply:reset` to rebuild demo data.
- **`NODE_CLUSTER_WORKERS=0` means "one worker per CPU core."** On a many-core dev box this can spawn a large number of Node processes; set it to `1` for a leaner E2E run.
