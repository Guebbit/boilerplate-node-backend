---
source: docker-compose.production.yml
sha256: 92f379c0694da6ae7861db20a00cd0dda4573b76545f22938ddac4c76e71d2a9
generated_at: 2026-10-07T23:46:19.100297+00:00
model: ollama:qwen3.8:27b
---

# docker-compose.production.yml

## Purpose

Production deployment stack for the API, serving exactly one client organisation per stack. It builds and runs the image from `docker/Dockerfile.production` with no source bind-mounts, no host-exposed database ports, and only the four services the application cannot run without (`app`, `cron`, `setup`, plus optionally bundled backing services). It is the counterpart to `docker-compose.yml` (development), stripped of the full observability estate, hot-reload, and demo data.

## Key elements

- **`x-logging` anchor** — shared `json-file` driver config (10 MB × 5 files) merged into every service via `logging: *logging`. `CONTAINER_LOG_DRIVER` env var allows overriding for Podman (`k8s-file`).
- **`x-hardening` anchor** — `read_only`, `cap_drop: [ALL]`, `no-new-privileges`, and a 64 MB `noexec,nosuid` tmpfs at `/tmp`. Merged into `app`, `cron`, and `setup` (all share the same image).
- **`x-data-hardening` anchor** — `cap_drop: [ALL]` + selective `cap_add` (CHOWN, SETUID, SETGID, DAC_OVERRIDE, FOWNER) + `no-new-privileges`. Merged into `database`, `mongo-rs-init`, `cache`, `queue`. No `read_only` because official data images `chown` at startup.
- **`x-monitoring-hardening` anchor** — `cap_drop: [ALL]` + `no-new-privileges` for the monitoring-profile services.
- **`x-app-env` anchor** — shared environment block; sets `NODE_ENV=production` and points `npm_config_cache` / upload staging at the tmpfs.
- **`setup` service** — one-shot job running `db:sync` and `access:bootstrap`, then exits. `app` and `cron` depend on it completing successfully. Never runs the demo seeder (`scenarios/apply.ts` refuses `NODE_ENV=production`).
- **`bundled` profile** — `database` (MongoDB replica set + `mongo-rs-init`), `cache` (Redis), and `queue` (RabbitMQ) start only when `COMPOSE_PROFILES` includes `bundled`. Remove `bundled` and set `NODE_DB_URI`/`NODE_REDIS_URL`/`NODE_RABBITMQ_URL` to use managed services instead.
- **`monitoring` profile** — Prometheus, Alertmanager, Loki, and Alloy. No host ports published; no Grafana. Prometheus scrapes with the same `metrics_token` secret file the app reads.
- **Secrets as files** — each service reads credentials from `clients/<name>/secrets/` via `NODE_*_FILE` variables (app) or `secret_file` (data services). Files must exist for compose to start the service; empty file means "use the password embedded in the connection URI."

## Relationships

- **`docker-compose.proxy.yml`** — a fronting reverse-proxy layer; this file's services listen on internal compose-network ports only and expect TLS termination / routing to be handled upstream.
- **`docker-compose.test.yml`** — the test-environment counterpart; shares the same service topology but without production hardening, the `setup` gate, or the per-client secrets model.
- **`asyncapi.yaml`** — the API contract that the `app` service here implements; the stack deploys the runtime that fulfils that specification.

## Notes

- **One stack per client.** `COMPOSE_PROJECT_NAME` namespaces all containers/networks/volumes *and* selects the client's env file. Unset → nothing starts. Never share a stack across clients.
- **Dual env-file mechanism.** The client `.env` is read twice: once by compose for `${...}` interpolation in this file, and once via `env_file:` inside the container. Naming only one channel silently gives every client the same config.
- **Secret file permissions.** Compose ignores `uid`/`mode` on file secrets, so files must be world-readable (0644) to serve both Redis (uid 999) and node (uid 1000). The directory should be 0700.
- **Bundled vs. managed switch.** `depends_on` uses `required: false` so that `app`/`cron`/`setup` start even when the bundled containers are absent. Forgetting to remove `bundled` from `COMPOSE_PROFILES` will start unused data containers.
- **Alertmanager ships a `null` receiver** — it notifies nobody. A real receiver must be configured in `docker/observability/alertmanager.config.yaml` before any alert is meaningful.
- **`read_only` is intentionally absent on data services.** The official entrypoints `chown` and write config to the container root; forcing `read_only` breaks them.
- **`clients/` is in `.dockerignore` and `.gitignore`.** It is mounted at runtime, never baked into the image.
