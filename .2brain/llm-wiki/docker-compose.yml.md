---
source: docker-compose.yml
sha256: 32c5fa97efbe80ce2e789da32b10aa28665dcd9789458933d2723f623b5f1105
generated_at: 2026-10-01T12:18:01.701391+00:00
model: ollama:qwen3.8:27b
---

# docker-compose.yml

## Purpose

Defines the full local development stack in a single file: the Node.js API (`app`), its backing services (MongoDB, Redis, RabbitMQ), an external cron scheduler (supercronic), and opt-in observability/analytics profiles. A single `compose up` yields a populated, health-checked, log-forwarded environment with seeded demo data — no separate setup scripts needed.

## Key elements

- **`x-logging` anchor** — Shared log-driver setting (`json-file` by default, overridable via `CONTAINER_LOG_DRIVER`). Applied to every service so Promtail's file-tail glob always matches.
- **`app` service** — The primary Node.js API container.
  - Builds from `docker/Dockerfile`; binds the host project directory at `/app` for hot reload.
  - `command` runs `npm run db:bootstrap` (sync + seeder) then starts the server (cluster or single-process depending on `NODE_ENABLE_CLUSTERING`).
  - `healthcheck` uses `node -e "fetch(...)"` against `/livez` (no curl in the alpine base image).
  - `depends_on` gates on `database` health before booting.
  - Environment block exposes every runtime knob as `${VAR:-default}` so a shell override (e.g. for E2E rate-limit bumps) takes precedence over `.env`.
- **Scheduler service (supercronic)** — Reads a bind-mounted `docker/crontab`; runs `scripts/ops/reap-*` / `sweep:*` jobs on schedule. Uses the same image as `app`. Enforces single-instance via `replicas: 1` plus a Mongo lease. *(Definition truncated in source.)*
- **Referenced services** — `database`, `redis`, `rabbitmq`, `umami`, and observability/analytics containers are declared further down (truncated) and are the targets of the `depends_on` and `NODE_*_URL` env vars above.

## Relationships

- **`github/workflows/ci.yml`** — CI starts this compose stack (via `npm run compose:up` / `compose:restart`) to drive the frontend E2E suite. The file's inline comments document the exact shell overrides CI is expected to pass (`NODE_RATE_LIMIT_MAX`, `NODE_AUTH_RATE_LIMIT_MAX`, `NODE_AUTH_RATE_LIMIT_ADDRESS_MAX`) to avoid 429 responses during a full-suite run from a single IP. The CI job is the primary consumer of the `app` service's published port and healthcheck.

## Notes

- **Podman vs. Docker logging:** Podman's default driver is `journald` (no file output). If `CONTAINER_LOG_DRIVER` is unset on a Podman host, Promtail tails a non-existent path and Loki silently stays empty. The anchor exists specifically to prevent this.
- **Seeder is not idempotent** — it builds demo orders by driving real checkouts, then skips (exit 0) if any data already exists. `scenario:apply:reset` is the explicit rebuild path. It also refuses to run when `NODE_ENV=production`.
- **Do not redeclare `NODE_MONGODB_HOST` in the `environment` block.** An entry there shadows `.env`, making an external Mongo URI impossible to set without editing the compose file.
- **Two Umami hosts, different contexts:** `NODE_UMAMI_HOST` is a host-facing URL for browser health reporting (uses `localhost`); `NODE_UMAMI_INGEST_HOST` is the in-network service URL the API dials (uses the `umami` hostname). Swapping them breaks one or the other silently.
- **Rate-limit env vars are deliberately overridable from the shell** for E2E runs; their defaults match `.env`, so a plain `up` is unaffected.
- The file content provided is truncated; services beyond the scheduler (database, redis, rabbitmq, umami, observability, analytics, and any top-level `volumes:` / `networks:` sections) are not visible here.
