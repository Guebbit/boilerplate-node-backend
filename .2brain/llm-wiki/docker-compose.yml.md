---
source: docker-compose.yml
sha256: d22a772c19d33e445c1207eaac596a278ce79640491ad6c1b4c8f226d9e72457
generated_at: 2026-11-14T17:10:22.313401+00:00
model: ollama:qwen3.8:27b
---

# docker-compose.yml

## Purpose

Local development stack definition. Spins up the Node.js API, its data dependencies (MongoDB, two Redis instances, RabbitMQ), and an external job scheduler as a single `compose up`. It is the canonical way to get a populated, browsable dev environment in one command, with opt-in observability and analytics profiles.

## Key elements

- **`x-logging` anchor** — YAMl anchor (`&container-logging`) that pins the log driver to `json-file` (overridable via `CONTAINER_LOG_DRIVER`). Must stay a file-based driver because Alloy tails log files; podman's default `journald` writes no file and silently breaks Loki.
- **`app` service** — The Node.js API.
  - Builds from `docker/Dockerfile` (build context is repo root).
  - Bind-mounts `./app` into the container with `:Z` for hot reload; an anonymous volume shields `node_modules`.
  - `command` runs `npm run db:bootstrap` (schema sync + one-time seeder) then `dev:docker` or `dev:docker:cluster` based on `NODE_ENABLE_CLUSTERING`.
  - Healthcheck hits `/livez` via `node -e` + `fetch` (image is alpine, no curl).
  - `depends_on` gates `database` on `service_healthy`; other deps on `service_started`.
  - Rate-limit env vars (`NODE_RATE_LIMIT_MAX`, `NODE_AUTH_RATE_LIMIT_MAX`, `NODE_AUTH_RATE_LIMIT_ADDRESS_MAX`) are declared here with defaults matching `.env` so a live E2E run can raise them from the shell without editing `.env`.
  - Observability URLs (`NODE_LOKI_HOST`, `NODE_UMAMI_HOST`, `NODE_FARO_COLLECTOR_URL`) are host-facing (browser-reachable) and set here because this file is what starts those containers.
  - `NODE_UMAMI_INGEST_HOST` is a service-name URL (`http://umami:3000`) because the API dials it from inside the compose network.
- **Scheduler service** (truncated) — Runs `supercronic` with the same image as `app`; schedule lives in `docker/crontab`. Chosen over in-process `node-cron` to keep scheduling as deployment config and to stay portable to Kubernetes `CronJob` / systemd timers.
- **`limits` Redis** — Dedicated instance for rate-limit counters and single-use claims; never evicted. Distinct from the general `redis` instance.

## Relationships

- **`docker/Dockerfile`** — Build target for the `app` (and scheduler) services. The compose file supplies the build context (`.`) and points to this path.
- **`docker/crontab`** — Schedule file consumed by the `supercronic` scheduler service.
- **`docker-compose.production.yml`** — Production variant; this file is the development counterpart (different env, logging, profiles, and restart policies).
- **`docker-compose.test.yml`** — Test-stack variant; shares the same service topology but typically overrides ports, credentials, and disables seeding.
- **`src/infrastructure/persistence/lease.ts`** — The app code that dials the `limits` Redis instance (`NODE_RATE_LIMIT_REDIS_URL`) defined here for single-use claims and rate-limit counters.
- **`scenarios/support/development-doubles.ts`** — E2E test helpers that depend on the seeded data produced by `db:bootstrap` and on the rate-limit overrides this file exposes.
- **`docs/getting-started.md`** — Points new developers at this file as the entry point for a local stack.
- **`docs/reference/ops.md`** — Documents the external-scheduler pattern (supercronic / `docker/crontab`) that this file implements.
- **`docs/tools/health-checks.md`** — Explains the liveness-vs-readiness distinction this file's healthcheck follows (`/livez`, never used as a `depends_on` gate).

## Notes

- **Logging driver matters.** If you switch the runtime from Docker to Podman, the `x-logging` anchor is the only thing preventing silent log loss. Do not remove it or override it with `journald` without also updating Alloy's tail path.
- **Env vars here shadow `.env`.** Any variable explicitly listed under `environment:` cannot be changed via `.env` alone—edit the compose file or use a shell override. The rate-limit trio is declared here *specifically* to keep it shell-overridable for E2E runs.
- **Seeder is one-shot and idempotent-skip.** `db:bootstrap` seeds a fresh DB but exits 0 on an already-populated one. To re-seed, use `scenario:apply:reset`. The seeder also hard-refuses when `NODE_ENV=production`.
- **`NODE_CLUSTER_WORKERS` defaults to 0** (= one worker per core). On many-core machines this can be heavy for a single developer; set `NODE_CLUSTER_WORKERS=1` for lighter E2E runs.
- **Analytics default is `none`.** The `analytics` profile must be active *and* `NODE_ANALYTICS_PROVIDER` set to `umami` or `posthog` before `emitAnalyticsEvent` delivers.
- **Port binding defaults to `127.0.0.1`.** Set `NODE_HOST=0.0.0.0` (or a LAN IP) to reach the stack from another device.
