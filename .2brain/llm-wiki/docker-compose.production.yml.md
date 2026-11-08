---
source: docker-compose.production.yml
sha256: b32f605755ae2c8b1745906a7d1a31a30e7534992312fb83940f7c98ed147e70
generated_at: 2026-11-08T02:16:59.513867+00:00
model: ollama:qwen3.8:27b
---

# docker-compose.production.yml

## Purpose

Production deployment stack for a single-client API. Unlike `docker-compose.yml` (development), it runs a pre-built image (`docker/Dockerfile.production`), bind-mounts no source, exposes no database port to the host, and ships only the services the application requires. It is operated per-client via `COMPOSE_PROJECT_NAME`, which namespaces containers, networks, and volumes.

## Key elements

- **`x-logging` anchor** — shared `json-file` log driver with 10 MB × 5 rotation, merged into every service via `logging: *logging`. Driver is overridable via `CONTAINER_LOG_DRIVER` for Podman.
- **`x-hardening` anchor** — `read_only`, `cap_drop: [ALL]`, `no-new-privileges`, and a `noexec` tmpfs at `/tmp` (64 MB). Merged into `app`, `cron`, and `setup`.
- **`x-data-hardening` anchor** — `cap_drop: [ALL]` plus selective `cap_add` (CHOWN, SETUID, SETGID, DAC_OVERRIDE, FOWNER) and `no-new-privileges`. Merged into `database`, `mongo-rs-init`, `cache`, `queue`. `read_only` is intentionally absent.
- **`app` / `cron` / `setup`** — the three application containers, all from `APP_IMAGE` (no default tag; set by `docker/deploy.sh`). `setup` is one-shot (`db:sync` + `access:bootstrap`) and gates startup of the other two.
- **`database` / `cache` / `queue`** — bundled MongoDB (with `mongo-rs-init`), Redis, and RabbitMQ. All behind `profiles: [bundled]` so they can be replaced by managed URIs.
- **Monitoring profile** (`profiles: [monitoring]`) — Prometheus, Alertmanager, node_exporter, Loki, Alloy. No host ports, no Grafana. Off by default.
- **Secrets** — file-based via `secrets:`; each service receives only the files it needs. Optional integrations (SMTP, payments, OAuth) remain in the client `.env`.
- **`APP_IMAGE`** — required, no default. Prevents accidental `latest` drift.

## Relationships

- **`docker-compose.yml`** — the development counterpart; this file is explicitly contrasted against it in comments (no hot-reload, no full observability estate, no source mounts).
- **`docker/Dockerfile.production`** — the image definition that `APP_IMAGE` must point to; builds the artifact these services run.
- **`docker/deploy.sh`** — the operator entrypoint: sets `APP_IMAGE`, runs `COMPOSE_PROJECT_NAME`, handles build/start/health-check/rollback.
- **`docker-compose.proxy.yml`** — sits in front of this stack (reverse-proxy / TLS layer) per the project layout.
- **`docker/mongo-init.js`** — referenced by the `mongo-rs-init` service for replica-set initialisation and role creation.
- **`scenarios/apply.ts`** — the demo seeder; this file's comments note it refuses `NODE_ENV=production`, so the production `setup` service deliberately never calls it.
- **`env-example`** — the template copied to `clients/<name>/.env`; provides the `${...}` values this file interpolates.
- **`docs/getting-started-production.md`** — walkthrough for first deploy, secrets setup, and monitoring/alerts configuration.
- **`docs/tools/configuration.md`** — documents the `NODE_X_FILE` secret-file convention used here.
- **`docs/tools/security.md`** — CIS benchmark references (2.12, 5.x) cited inline for the hardening anchors.
- **`docs/tools/backups.md`** — the `restic_password` / `restic_repository_env` secrets and backup/restore-drill services referenced here.

## Notes

- **`APP_IMAGE` has no default.** Running `docker compose up` without it (or without going through `deploy.sh`) will fail. There is no `latest` fallback by design.
- **`COMPOSE_PROJECT_NAME` is mandatory.** Unset, no containers are created. It doubles as the client selector for the `.env` file path.
- **Dual env-file usage.** `--env-file` feeds `${...}` substitution in this YAML; `env_file:` inside a service definition feeds the container's environment. Both must point at the same `clients/<name>/.env` or config silently diverges.
- **`depends_on` uses `required: false`** so that `app`/`cron`/`setup` can start even when `COMPOSE_PROFILES` omits `bundled` (i.e. managed backing services).
- **`setup` is not a long-running service.** It exits after `db:sync` + `access:bootstrap`. A crash here is a deploy failure, not a runtime error.
- **Secret files must exist on the host** for the listed services or Compose refuses to start them. Empty files read as "unset" and let a managed-service URL stand in.
- **`clients/` is in `.dockerignore` and `.gitignore`.** Secrets and per-client config are mounted at runtime only; they never enter the image layer.
- **Monitoring publishes no host ports.** Prometheus and Alertmanager have unauthenticated web UIs reachable only on the internal compose network.
- **The `tmpfs` at `/tmp` is `noexec,nosuid`.** A named volume mounted over `/tmp` would re-enable `exec`; the comment warns against doing so.
