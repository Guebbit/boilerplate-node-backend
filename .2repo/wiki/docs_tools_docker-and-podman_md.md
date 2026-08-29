# docs/tools/docker-and-podman.md

## Purpose

Documents the repo's single local container setup (`docker-compose.yml`), covering the app runtime, core data services, and the full observability stack. Also explains how Podman is supported as a drop-in alternative to Docker and the one non-trivial difference (log collection) between the two engines.

## Key elements

- **`docker-compose.yml`** — single compose file defining all local services: `app`, `database` (MongoDB 8), `redis` (7), `rabbitmq` (3-management), and the observability stack (`otel-collector`, `tempo`, `prometheus`, `alertmanager`, `loki`, `promtail`, `grafana`). No override files or `COMPOSE_FILE` chaining.
- **`.docker/Dockerfile`** — `node:25-alpine` base with Chromium installed for Puppeteer/PDF rendering. Kept intentionally minimal; compose decides the runtime command.
- **Podman helper scripts** (`package.json`) — `compose:restart`, `compose:rebuild`, `compose:kill` all invoke `${CONTAINER_ENGINE:-podman} compose`. Default engine is Podman; set `CONTAINER_ENGINE=docker` (shell env var) to switch.
- **Promtail dual config** — two config files (`promtail.docker.config.yaml` / `promtail.podman.config.yaml`) selected via the `PROMTAIL_CONFIG` env var. Differ only in log parser (JSON envelope vs. CRI) and the glob under the shared `/var/log/host-containers` mount.
- **Port map** — App `:3000`, MongoDB `:27017`, Redis `:6379`, RabbitMQ `:5672`/`:15672`, OTel `:4317`/`:4318`, Prometheus `:9090`, Alertmanager `:9093`, Loki `:3100`, Grafana `:3001`.

## Relationships

- **docs/tools/grafana.md** — Grafana is defined as a service in this compose file and is the unified query UI for Tempo (traces), Prometheus (metrics), and Loki (logs) as provisioned here.
- **docs/tools/events-and-logging.md** — Promtail and Loki are the log-collection pair wired up in this stack; the Podman log-driver configuration documented here directly affects whether Promtail finds any log files to tail.
- **docs/tools/email-and-rendering.md** — RabbitMQ (defined here) is the broker for async email and PDF-generation jobs; the Chromium dependency in the Dockerfile exists specifically to support Puppeteer-driven PDF rendering.
- **docs/tools/frontend-observability.md** — The app container emits OTLP traces (to `otel-collector`) and exposes `/observability/metrics` (scraped by Prometheus), both of which are wired up in this compose file.

## Notes

- **Podman log driver gotcha**: Podman defaults to `journald` (no log files on disk). Promtail tails files, so without setting `CONTAINER_LOG_DRIVER=k8s-file` plus the correct `CONTAINER_LOGS_PATH`, Loki stays empty and Grafana log panels are blank with no error. Three `.env` values fix this; Docker needs none of them.
- **`CONTAINER_ENGINE` is a shell variable, not a `.env` value.** npm does not read `.env`, so this must be exported in the shell profile. Compose *does* read `.env` for the two Promtail variables — that split is intentional.
- **Do not set `COMPOSE_FILE` in `.env`.** Docker Compose honours it; podman-compose (≥1.6.0) silently ignores it, making anything built on it work on one runtime and do nothing on the other.
- The RabbitMQ management UI (`:15672`) and Grafana (`:3001`) both have anonymous/local access enabled by default for development; do not expose these ports to a network.
