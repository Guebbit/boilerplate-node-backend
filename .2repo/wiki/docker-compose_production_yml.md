# docker-compose.production.yml

## Purpose

The production deployment stack for the API. It runs the four services the application cannot function without (app, MongoDB, Redis, RabbitMQ) as a self-contained unit, deliberately excluding the observability estate that the development stack (`docker-compose.yml`) includes. It is the file an operator hands to a deployment target.

## Key elements

- **`app`** — Builds `.docker/Dockerfile.production`, runs `NODE_ENV=production` with clustering disabled (`NODE_ENABLE_CLUSTERING=0`). Binds the HTTP port to `127.0.0.1` only (expects a TLS reverse proxy in front). Mounts the `.env` file and overrides connection URIs with compose-network hostnames. Uses `stop_grace_period: 30s` so `SIGTERM` reaches the process for graceful shutdown. Optional `INSTALL_CHROMIUM` build arg (PDF invoices).
- **`database`** — `mongo:8`. No published ports; reachable only on the compose network. Health-checks via `mongosh` ping. Named volume `mongo-data`.
- **`cache`** — `redis:8-alpine`. RDB snapshotting (`--save 60 1`), AOF disabled. Health-checks via `redis-cli ping`. Named volume `redis-data`.
- **`queue`** — `rabbitmq:4-alpine`. Health-checks via `rabbitmq-diagnostics ping`. Named volume `rabbitmq-data`.
- **`volumes`** — Four named volumes (`mongo-data`, `redis-data`, `rabbitmq-data`, `uploads`) for data persistence across redeploys.
- **`OTEL_EXPORTER_OTLP_ENDPOINT`** — Passed through from `.env`; an empty value means telemetry is simply off. No collector is defined in this file.

## Relationships

- **`docker-compose.yml`** — The development counterpart. This file is intentionally minimal relative to it. The trailing comment warns that merging the two files (`-f production -f dev`) is incorrect because it re-introduces bind-mounts and dev commands. To add observability to a deployment, copy the relevant service blocks into a separate override file.
- **`docker/observability/`** — Contains the Prometheus / Loki / Tempo / Grafana / Alloy / Umami configurations referenced by the dev stack. Not used by this file but available if an operator wants to bring the estate up alongside production (via a separate override file, not by merging).

## Notes

- **`.env` is mandatory.** `MONGO_PASSWORD` and `RABBITMQ_PASSWORD` use the `:?` syntax — compose aborts with an error if they are unset. `NODE_JWT_SECRET`, `NODE_JWT_REFRESH_SECRET`, and `NODE_METRICS_TOKEN` must also be set to real values (not the examples in `.env-example`).
- **No public port exposure.** The app port is bound to `127.0.0.1`. Publishing it on `0.0.0.0` without TLS would serve auth cookies over plain HTTP.
- **Scaling is external.** `NODE_ENABLE_CLUSTERING=0` is explicit; use `--scale app=N` or an orchestrator rather than an in-container cluster.
- **The `uploads` volume is a single-host stopgap.** Two replicas on different hosts do not share it. The long-term path is an S3-compatible `ImageStore` backend.
- **`restart: unless-stopped`** is used everywhere (not `always`), so an operator who manually stops a container during an incident keeps it stopped across a daemon restart.
