---
source: docker-compose.production.yml
sha256: afb890467486a3a74e7b5e94c5b9b21a9a584657a50a664bda8a8d47ec1f54e3
generated_at: 2026-10-01T12:17:40.754997+00:00
model: ollama:qwen3.8:27b
---

# docker-compose.production.yml

## Purpose

The production deployment stack for the API. Unlike the development `docker-compose.yml` (which bind-mounts source, runs a hot-reload server, and pulls up the full observability suite), this file runs the pre-built `Dockerfile.production` image, mounts no source, exposes the port only on loopback, and starts only the services the application cannot run without. It enforces a **one-deployment-per-client** model: `COMPOSE_PROJECT_NAME` namespaces every container, network, and volume, and selects the per-client `.env` under `clients/<name>/`.

## Key elements

- **`x-hardening` (YAML anchor `&hardening`)** — applied to `app`, `cron`, and `setup`: `read_only: true`, `cap_drop: [ALL]`, `no-new-privileges`, and a `noexec,nosuid` tmpfs at `/tmp` (64 MiB). CIS Docker Benchmark 5.12 / 5.25.
- **`x-app-env` (YAML anchor `&app-env`)** — shared environment: `NODE_ENV=production`, `npm_config_cache` redirected to the tmpfs (read-only root), and default connection URIs for Mongo (TLS + replicaSet), Redis, and RabbitMQ. Each default is overridable via the client env file.
- **`services.app`** — main HTTP API. Built once from `docker/Dockerfile.production`, tagged `${APP_IMAGE:-boilerplate-api:latest}`, referenced by `cron`/`setup` via `image:` alone (one build, three containers). Port bound to `127.0.0.1` only. Named volumes: `uploads`, `storage` (invoice cache + mail spool), `quarantine`, `mongo-ca-dir` (ro). `stop_grace_period: 30s`; `restart: unless-stopped`.
- **`services.setup`** — one-shot job (`db:sync` + `access:bootstrap`) that exits after success. `app` and `cron` gate on it via `depends_on`. Deliberately never runs the demo seeder (`scenarios/apply.ts` hard-refuses `NODE_ENV=production`).
- **`services.cron`** — scheduled-job worker; same image, same hardening; `depends_on` setup + bundled services.
- **`services.database` / `cache` / `queue`** — bundled MongoDB (TLS, one-node replica set via `mongo-rs-init`), Redis, and RabbitMQ. All carry `profiles: [bundled]`; they start only when `COMPOSE_PROFILES` includes `bundled`. `depends_on` from `app`/`cron`/`setup` uses `required: false` so managed-service deployments can omit them.
- **`COMPOSE_PROJECT_NAME`** — mandatory (`:?` guard on `env_file`). Namespaces the Compose project and selects the client's `.env`. Unset → nothing starts.

## Relationships

- **`docker-compose.proxy.yml`** — the port published here is bound to `127.0.0.1` by design; a TLS-terminating reverse proxy (defined in the proxy compose file) sits in front and publishes the public interface. This file never serves HTTP directly to a non-loopback address.
- **`asyncapi.yaml`** — the `queue` service (RabbitMQ) is the message broker transport for the async operations described in the async API spec. The default `NODE_RABBITMQ_URL` in `x-app-env` points at this bundled service (or a managed replacement).

## Notes

- **Double-named env file.** The client's `.env` is read twice: once by `docker compose --env-file` (resolves `${…}` in this file) and once by the container-level `env_file:` directive. Naming only one silently gives every client identical config.
- **Bundled vs. managed switch.** To use managed MongoDB/Redis/RabbitMQ, set the corresponding `NODE_*` URI in the client env file **and** remove `bundled` from `COMPOSE_PROFILES`. The `required: false` on `depends_on` is what allows `app` to start without the bundled containers.
- **Mongo TLS.** The bundled `database` mints a self-signed CA at boot (`mongo-entrypoint.sh`); the public cert is shared via the `mongo-ca-dir` volume, mounted read-only on the app containers. `NODE_DB_URI` includes `tls=true&tlsCAFile=/ca-dir/mongo-ca.crt`.
- **`INSTALL_CHROMIUM` build arg** (default `false`) — adds ~200 MB for the PDF invoice endpoint. Only set it if that endpoint is actually used.
- **Telemetry.** `OTEL_EXPORTER_OTLP_ENDPOINT` defaults to empty; an OTLP collector is deliberately *not* defined in this file. Point it at an external collector or a separate compose file.
- **`clients/` directory** is in both `.dockerignore` and `.gitignore`; it is mounted at runtime and never baked into the image.
