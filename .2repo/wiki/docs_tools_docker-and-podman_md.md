# docs/tools/docker-and-podman.md

## Purpose

Documents the single local container implementation (`docker-compose.yml`) and the Podman-compatible helper scripts in `package.json`. It serves as the authoritative reference for which containers exist, their ports, their roles, and the one non-trivial difference (log driver) between running under Docker vs. Podman.

## Key elements

- **Container map (Mermaid diagram)** — visual topology of the full compose stack: app, core data (MongoDB, Redis, RabbitMQ), and the 7-service observability stack (OTel Collector → Tempo, Prometheus → Alertmanager, Promtail → Loki, all feeding Grafana).
- **Container reference tables** — per-container image, ports, role, and a "Read next" link for each service.
- **Service groups** — three logical groupings (App runtime / Core data / Observability) with a one-line rationale.
- **Podman & Promtail log collection** — the three `.env` variables (`CONTAINER_LOGS_PATH`, `PROMTAIL_CONFIG`, `CONTAINER_LOG_DRIVER`) that make log tailing work under Podman's `k8s-file` driver; explains why the default (`journald`) silently produces no logs.
- **Engine selection** — `CONTAINER_ENGINE` shell variable consumed by `npm run compose:*` scripts; explicitly *not* a `.env` value.
- **Kubernetes threshold** — short checklist of when compose stops being sufficient.

## Relationships

- **docs/tools/mongodb-mongoose.md** — "Read next" target for the `database` container; explains the MongoDB/Mongoose layer the container provides.
- **docs/tools/redis-cache.md** — "Read next" for `redis`; documents the caching contract the container serves.
- **docs/tools/rabbitmq.md** — "Read next" and Related-pages link; details the AMQP broker and management UI.
- **docs/tools/opentelemetry.md** — "Read next" for `otel-collector`; describes the OTLP instrumentation the collector ingests.
- **docs/tools/prometheus.md** — "Read next" for both `prometheus` and `alertmanager`; covers scrape config, alert rules, and the `/observability/metrics` endpoint.
- **docs/tools/loki.md** — "Read next" for `loki` and `promtail`; explains LogQL queries and the Promtail pipeline.
- **docs/tools/grafana.md** — "Read next" and Related-pages link; documents the dashboard UI that unifies Tempo, Prometheus, and Loki.
- **docs/tools/package-scripts.md** — Related-pages link; defines the `compose:restart`, `compose:rebuild`, `compose:kill` npm scripts this page depends on.

## Notes

- `CONTAINER_ENGINE` is a **shell** variable read by npm, not a `.env` variable. Compose reads `.env`; npm does not. Setting it in `.env` has no effect on which binary is invoked.
- **Do not set `COMPOSE_FILE` in `.env`.** Docker Compose honours it there, but podman-compose (v1.6.0, verified 2026-08-05) ignores it, causing silent no-ops on Podman.
- The log driver is applied via a YAML anchor across *all* services; leaving any one on the default means that service's logs are invisible to Promtail.
- The previous multi-file override mechanism (separate compose override + `scripts/compose.ts` selector) was removed after it selected the Docker override on a Podman-only host, causing Promtail to tail nothing.
- The Dockerfile installs Chromium specifically for Puppeteer-driven PDF generation; this is not a general browser dependency.
- Redis cache is intentionally ephemeral (no volume); data is expected to be lost on restart.
