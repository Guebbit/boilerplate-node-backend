---
source: docker-compose.production.yml
sha256: e9f00457d59525565eb5cbd3aaaf8df00701a25a647feb9a81f403d61ec9bfca
generated_at: 2026-11-14T17:09:36.634333+00:00
model: ollama:qwen3.8:27b
---

# docker-compose.production.yml

## Purpose

The production deployment stack for a single client's API. It runs the image built by `docker/Dockerfile.production` (no source bind-mounts, no dev tooling), starts only the four services the application needs (app, cron, setup, plus bundled or managed data services), and enforces container hardening. It is the counterpart to `docker-compose.yml` (development): no hot reload, no observability estate by default, no database port exposed to the host.

## Key elements

- **`x-logging` / `x-hardening` / `x-data-hardening` (YAML anchors)** — shared configuration blocks merged into services. `x-logging` caps `json-file` logs at 10 MB × 5 files (CIS 2.12/5.x). `x-hardening` applies `read_only`, `cap_drop: [ALL]`, `no-new-privileges`, and a `noexec` tmpfs on `/tmp` to app/cron/setup. `x-data-hardening` is the lighter variant for official data images (Mongo, Redis, RabbitMQ) that need `CHOWN`, `SETUID`, `SETGID`, etc., but omits `read_only`.
- **`setup` service** — one-shot: runs `db:sync` + `access:bootstrap`, then exits. `app` and `cron` depend on it completing before serving traffic.
- **`app` / `cron` services** — long-running API and scheduler, both using the `APP_IMAGE` image. `APP_IMAGE` has **no default**; `docker/deploy.sh` must set it.
- **`database` / `cache` / `queue` services** — bundled MongoDB (replica set), Redis, and RabbitMQ. Gated behind `profiles: [bundled]` so a managed backing service can be substituted by removing `bundled` from `COMPOSE_PROFILES` and setting `NODE_DB_URI` / `NODE_REDIS_URL` / `NODE_RABBITMQ_URL`.
- **`mongo-rs-init`** — runs `docker/mongo-init.js` once to initialise the replica set; gated behind the same `bundled` profile.
- **Monitoring profile (`monitoring`)** — Prometheus, Alertmanager, node_exporter, Loki, Alloy. Off by default; no host ports published; scrapes `app` using the shared `metrics_token` secret file.
- **`COMPOSE_PROJECT_NAME`** — doubles as the client identifier: namespaces containers/networks/volumes **and** selects that client's config. Unset → nothing starts.
- **Secrets as files** — credentials live one-per-file under `clients/<name>/secrets/` (mode 0644, dir 0700), injected via `file`-type secrets rather than env vars. Each service receives only its own secret. Compose refuses to start if a required secret file is missing.

## Relationships

- **`docker-compose.yml`** — the development stack (hot reload, full observability). This file is its production counterpart; they share the same app image recipe but differ in mounts, ports, and service set.
- **`docker-compose.proxy.yml`** — proxy/reverse-proxy layer that sits in front of this stack's `app` service.
- **`docker/Dockerfile.production`** — builds the image (`APP_IMAGE`) that `app`, `cron`, and `setup` run.
- **`docker/deploy.sh`** — the operational entry point: sets `APP_IMAGE`, runs `docker compose up` against this file, health-checks, and supports `--rollback`. All the CLI examples in this file's header assume `deploy.sh` is the caller.
- **`docker/mongo-init.js`** — executed by the `mongo-rs-init` service to initialise the bundled MongoDB replica set.
- **`env-example`** — the per-client configuration template; supplies the `${...}` values this file substitutes (via `--env-file`) and the `env_file:` entries the containers receive at runtime.
- **`scenarios/apply.ts`** — the demo data seeder. Explicitly refuses to run under `NODE_ENV=production`; the `setup` service therefore never calls it, and a production database starts empty.
- **`docs/getting-started-production.md`** — step-by-step first-deploy guide referencing this file's `COMPOSE_PROJECT_NAME`, secrets layout, and monitoring profile.
- **`docs/tools/configuration.md`** — documents the `NODE_*_FILE` secrets-as-files pattern this file enforces.
- **`docs/tools/security.md`** — rationale and CIS benchmark mapping for the hardening anchors.
- **`docs/tools/backups.md`** — backup/restore procedures that depend on the `restic_password` and `restic_repository_env` secret files defined here.

## Notes

- **The per-client env file is read twice.** `--env-file` resolves `${...}` substitutions *in this YAML file*; `env_file:` inside each service is what the *container* receives. Configuring only one channel silently gives every client identical app config.
- **`APP_IMAGE` has no default.** A `latest` tag was historically overwritten by every build, destroying rollback. `deploy.sh` sets it explicitly; running `docker compose up` without it will fail.
- **One stack per client.** Never one stack serving multiple organisations. `COMPOSE_PROJECT_NAME` is both the namespace and the config selector.
- **`clients/` is in `.dockerignore` and `.gitignore`** — secret files and per-client config are mounted at runtime, never baked into the image.
- **Bundled vs. managed data services:** removing `bundled` from `COMPOSE_PROFILES` and setting the `NODE_*_URI` variables lets a client use a managed MongoDB/Redis/RabbitMQ without editing this file. `depends_on` entries use `required: false` so app/cron/setup still start when bundled containers are absent.
- **Monitoring is opt-in.** No host ports are published for Prometheus/Alertmanager/Loki — their web UIs have no auth and are reachable only on the internal compose network.
- **`cron` and `setup` carry the full app secret set** even though they use few of the keys: every script validates the entire configuration before running and refuses a missing key.
