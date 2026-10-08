---
source: docker-compose.yml
sha256: 9abd31b4327c2b961f0838da0f6ec33bfd3f71416b0a6551771c8d872cfea23e
generated_at: 2026-10-07T23:47:12.817009+00:00
model: ollama:qwen3.8:27b
---

# docker-compose.yml

## Purpose

Defines the full local development stack (Node API, MongoDB, Redis instances, RabbitMQ, and observability/analytics services) as a single `docker compose up` invocation. It wires runtime configuration—rate limits, clustering, OTel, analytics, health-integration URLs—directly into the `app` container so that a fresh clone boots a populated, browsable system without manual seeding.

## Key elements

- **`x-logging` (YAML anchor)** — Sets the container log driver (`json-file` or `k8s-file`) via `CONTAINER_LOG_DRIVER` env var. Applied to every service so Promtail can tail the log file and feed Loki. Without it, Podman's default `journald` driver leaves no file and Loki/Grafana show nothing.
- **`app` service** — The Node.js API container.
  - **`build`** — Context `.`, Dockerfile at `docker/Dockerfile`.
  - **`command`** — Runs `npm run db:bootstrap` (idempotent `db:sync` + seeder that skips if data exists and refuses when `NODE_ENV=production`), then starts `dev:docker` or `dev:docker:cluster` based on `NODE_ENABLE_CLUSTERING`.
  - **`environment`** — Declares runtime-tunable knobs (cluster workers, rate-limit budgets, OTel endpoint, analytics provider, Umami ingest host, Loki/Umami/Faro host URLs for `/observability/health`). Defaults match `.env` so an ordinary `up` is unchanged; shell overrides enable E2E runs without editing files.
  - **`volumes`** — Bind-mount `.` to `/app` (hot reload, `:Z` for SELinux); anonymous volume at `/app/node_modules` to isolate installs.
  - **`depends_on`** — `database` (healthy), `redis`, `limits`, `rabbitmq` (started).
  - **`healthcheck`** — `node -e fetch('.../livez')` every 2 min, 3 retries, 30 s start period. Uses Node's built-in `fetch` because the alpine image has no `curl`.
- **`database` service** (truncated) — MongoDB; the seeder populates its volume on first boot.
- **`redis` / `limits` services** — Two separate Redis instances: general cache/session vs. rate-limit counters (never evicted).
- **`rabbitmq` service** — Message broker for the app.
- **Scheduler service** (truncated) — External cron equivalent; same image as `app`.
- **`observability` / `analytics` profiles** — Opt-in groups for OTel Collector, Loki, Alloy/Faro, Umami, and PostHog.

## Relationships

- **`github/workflows/ci.yml`** — The CI workflow invokes this compose file (via `npm run compose:*` scripts) to spin up the stack for integration/E2E test runs. Rate-limit and cluster-worker env vars are overridden in the CI shell for the same reason described in the inline comments (a single-address E2E suite would otherwise trip 429s). The CI job depends on the same `db:bootstrap` flow to get a populated database.

## Notes

- **Podman vs. Docker log driver:** If `CONTAINER_LOG_DRIVER` is unset, Docker's `json-file` works, but Podman defaults to `journald` (no file on disk). Always export `CONTAINER_LOG_DRIVER=k8s-file` on Podman hosts, or Loki will be silently empty with no error.
- **Rate-limit vars are a deliberate pair:** `NODE_AUTH_RATE_LIMIT_MAX` and `NODE_AUTH_RATE_LIMIT_ADDRESS_MAX` must be raised together during E2E runs; raising only one just moves which bucket trips first.
- **`NODE_UMAMI_HOST` vs. `NODE_UMAMI_INGEST_HOST`:** The former is a host-facing URL reported by the health endpoint (what a browser sees); the latter is the service-name URL the API dials from inside the compose network. Confusing them is a common mistake.
- **Seeder is not idempotent:** It drives real checkouts to build order history. It skips if the DB already contains data and exits 0. Use `scenario:apply:reset` to force a rebuild.
- **`.env` shadowing:** Any variable redeclared in the `environment` block overrides `.env`. Mongo connection is intentionally *not* declared here so an external `NODE_DB_URI` can be set without editing compose.
