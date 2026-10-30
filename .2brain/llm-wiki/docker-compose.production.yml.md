---
source: docker-compose.production.yml
sha256: fe6e0743ce92d77865be2950191dc2f706c1576f75676d1adb698d5b80e37545
generated_at: 2026-10-29T01:17:23.040678+00:00
model: ollama:qwen3.8:27b
---

# docker-compose.production.yml

## Purpose

The production deployment stack for a single client's API instance. Unlike `docker-compose.yml` (development), it runs the built image (`APP_IMAGE`), exposes no database port to the host, omits all dev observability tooling, and provisions only the four services the application requires: `app`, `cron`, `setup`, and (optionally) the bundled data services. It is the unit that `docker/deploy.sh` builds, starts, health-checks, and rolls back per client.

## Key elements

- **`x-logging` anchor** — Shared `json-file` log driver with `max-size: 10m` / `max-file: 5`. Overridable via `CONTAINER_LOG_DRIVER` for Podman (`k8s-file`).
- **`x-hardening` anchor** — Merged into `app`, `cron`, `setup`: `read_only: true`, `cap_drop: [ALL]`, `no-new-privileges`, and a `noexec,nosuid` tmpfs at `/tmp` (64 MB).
- **`x-data-hardening` anchor** — Merged into `database`, `mongo-rs-init`, `cache`, `queue`: `cap_drop: [ALL]` with `CHOWN, SETUID, SETGID, DAC_OVERRIDE, FOWNER` added back for official image entrypoints; `read_only` deliberately absent.
- **`setup` service** — One-shot; runs `db:sync` + `access:bootstrap` (indexes + shop row) then exits. `app` and `cron` depend on it (`required: false` so managed-service clients can skip bundled data containers).
- **`app` / `cron` services** — Run the `APP_IMAGE` image (no default tag). Read secrets via `NODE_*_FILE` env vars pointing into `clients/<name>/secrets/`.
- **`database` / `cache` / `queue`** — Bundled MongoDB, Redis, RabbitMQ under `profiles: [bundled]`. Replaceable by managed services by removing `bundled` from `COMPOSE_PROFILES` and setting `NODE_DB_URI` / `NODE_REDIS_URL` / `NODE_RABBITMQ_URL`.
- **`backup` / `restore-drill`** — Use `restic_password` and `restic_repository_env` secret files; the backup role never uses the Mongo root password.
- **Monitoring profile** (`profiles: [monitoring]`) — Prometheus, Alertmanager, node_exporter, Loki, Alloy. No host ports published. No Grafana. Alert routing driven by `ALERT_*` vars in the client `.env`.
- **`COMPOSE_PROJECT_NAME`** — Doubles as the client identity: namespacing (containers, networks, volumes) and config selection. Unset → nothing starts.

## Relationships

- **`docker-compose.proxy.yml`** — Sits in front of this stack as a reverse proxy / TLS termination layer. This file intentionally publishes no host ports for the app; the proxy handles inbound traffic and forwards to the compose network.
- **`docker-compose.test.yml`** — The test-environment analogue. Shares the same service topology (app, cron, setup, data services) but runs with test fixtures, no real secrets, and no hardening profiles.
- **`asyncapi.yaml`** — Defines the event/message contract (channels, operations) that the `app` and `cron` services implement. Not a runtime dependency of this compose file, but the source of truth for the message schemas the app emits and consumes.

## Notes

- **Two env-file channels.** `--env-file` resolves `${...}` substitutions in *this* file; `env_file:` is what the container receives. Omitting either one silently gives every client identical config.
- **`APP_IMAGE` has no default.** `docker/deploy.sh` must set it. A bare `latest` tag was a previous footgun (overwritten by every build, no rollback target).
- **Secrets are files, not env vars.** Each secret lives in `clients/<name>/secrets/` (dir 0700, file 0644). `docker inspect` shows none; child processes inherit none. Compose refuses to start a service whose required secret file is missing.
- **One stack per client.** `COMPOSE_PROJECT_NAME` enforces isolation. Never run one stack for multiple clients.
- **`clients/` is in `.dockerignore` and `.gitignore`.** Mounted at runtime, never baked into the image.
- **Bundled vs. managed services.** `depends_on` uses `required: false` so `app`/`cron`/`setup` start even when the bundled data containers are absent (managed-service path).
- **`setup` never runs the demo seeder.** `scenarios/apply.ts` hard-refuses `NODE_ENV=production`; a production DB starts empty.
