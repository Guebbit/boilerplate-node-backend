---
source: compose.production.yaml
source_sha256: 8f5f22144bd6a088dff56a4adec621d68f561449aa4778ab05243b0611d001d8
context_sha256: 0fc669c3a9492e79418844e1e336f69b7ba90e67152787c3a7ec9160629f7411
generated_at: 2026-11-22T01:26:39.104589+00:00
model: claude-code:claude-sonnet-5-5
---

# compose.production.yaml

## Purpose
The production Docker Compose stack for the API. It is layered on top of `compose.yaml` (shared service names, how `app` is built, common image pins) and replaces the development `compose.override.yaml`. It runs a pre-built image (the `runtime` stage of `docker/Dockerfile`), mounts no source, publishes no database port, and includes only the services the application needs. One stack serves one client, with config and secrets coming from `clients/<name>/`.

## Key elements
- **Invocation**: always run with both files, `-f compose.yaml -f compose.production.yaml`. An explicit `-f` stops `compose.override.yaml` from auto-loading. `docker/deploy.sh <client>` does this, and it also supports `--rollback`.
- **`APP_IMAGE`**: names the image that `app`, `cron` and `setup` run. It has no default, so each deploy is a pinned image that can be rolled back to. `deploy.sh` sets it.
- **`COMPOSE_PROJECT_NAME`**: the client's name. It namespaces containers, networks and volumes, and selects the client's config.
- **`setup` service**: a one-shot that runs `deploy:setup` (indexes plus the shop row). It never runs the demo seeder, because `scenarios/apply.ts` refuses `NODE_ENV=production`.
- **`x-logging`** (`logging: *logging`): applied to every service. Uses the `json-file` driver by default, overridable with `CONTAINER_LOG_DRIVER` (Podman support). Limits are 10m x 5 files.
- **`x-hardening`**: applied to `app`, `worker`, `worker-heavy`, `cron` and `setup`. Sets `read_only`, `cap_drop: ALL`, `no-new-privileges`, and a 64m `/tmp` tmpfs with `noexec,nosuid`.
- **`x-data-hardening`**: applied to `database`, `mongo-rs-init`, `cache` and `queue`. Drops all capabilities and adds back CHOWN, SETUID, SETGID, DAC_OVERRIDE and FOWNER. It does not set `read_only`, because the official entrypoints need a writable root.
- **`x-monitoring-hardening`**: drops all capabilities and sets `no-new-privileges` for the services under the `monitoring` profile (Prometheus, Alertmanager, node_exporter, Loki, Alloy).
- **`monitoring` profile** (off by default): enabled via `COMPOSE_PROFILES=bundled,monitoring`. It publishes no host ports. Prometheus scrapes using the `metrics_token` secret. Alertmanager routes from `ALERT_*` env vars, and with none set it sends alerts to `null`. Alloy tails container logs from `CONTAINER_LOGS_PATH`.
- **`backup` profile** (off by default): the `backup` service stays dormant while `BACKUP_REPOSITORY` is empty. It runs in its own container with a read-only `backup` Mongo role and mounts the volumes `:ro`. There is also a `restore-drill` profile. The settings live in `x-backup-env`, using `BACKUP_*` variables.
- **`x-app-env`**: shared environment with `NODE_ENV=production`. `NODE_DB_URI` defaults to the bundled `database` over TLS with `replicaSet=rs0`, with no password in the URL (it comes from a secret file). Any client-supplied value overrides it.
- **Services named in the visible part**: `app`, `worker`, `worker-heavy`, `cron`, `setup`, `database`, `mongo-rs-init`, `cache`, `queue`, `backup`, `restore-drill`.

## Relationships
- **`compose.yaml`**: the base file this one is merged with. It holds the shared service names, the `app` build, and the common image pins.
- **`docker/observability/prometheus.production.config.yaml`**: the Prometheus config for the `monitoring` profile. The comments say the alert rule files are the same ones the local stack loads.
- **`compose.backup-server.yaml`**: a sibling compose file, and its relationship is not described in the visible part of this file.
- **`README.md`** and **`k8s/base/*.yaml`** (`app`, `cache`, `cron`, `setup`): related by the dependency graph. The visible part of this file does not describe how they interact.

## Notes
- Secrets are files, and each service receives only its own. Client `.env` and `secrets/` live in `clients/<name>/`, never in the image.
- Telemetry is exported over OTLP to a collector that is deliberately not defined in this file.
- Redis and RabbitMQ are plaintext, which the file justifies as a single host on the compose network with no published ports.
- The named volumes (`uploads`, `storage`, `quarantine`) are not `noexec`. Only the `/tmp` tmpfs is.
