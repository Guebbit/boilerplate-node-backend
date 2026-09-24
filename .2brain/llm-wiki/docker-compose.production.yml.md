---
source: docker-compose.production.yml
sha256: 0b6834f8c61b52b993ee80510645e8476c9fd66f97d8486a2a9e12f404e1d32e
generated_at: 2026-09-23T17:11:40.548376+00:00
model: ollama:qwen3.8:27b
---

# docker-compose.production.yml

## Purpose

Production deployment stack for the API, running one client organisation per stack. It builds a hardened image (`docker/Dockerfile.production`), starts the minimum services the app needs (`app`, `cron`, `setup`, and optionally bundled `database`/`cache`/`queue`), and intentionally omits all development-only observability tooling. Telemetry is exported over OTLP to an external collector not defined here.

## Key elements

- **`x-hardening` (YAML anchor)** — shared container hardening: `read_only`, `cap_drop: [ALL]`, `no-new-privileges`, and a `noexec,nosuid` tmpfs at `/tmp`. Merged into `app`, `cron`, and `setup`.
- **`x-app-env` (YAML anchor)** — shared environment variables for all node services: `NODE_ENV=production`, `npm_config_cache` redirected to `/tmp/.npm`, and defaulted `NODE_DB_URI` / `NODE_REDIS_URL` / `NODE_RABBITMQ_URL` (TLS + replica-set for bundled Mongo).
- **`app`** — the API server. Binds to `127.0.0.1` only, `restart: unless-stopped`, `stop_grace_period: 30s`, no in-container clustering. Volumes: `uploads`, `storage` (invoice cache + mail spool), `quarantine`, and `mongo-ca-dir` (read-only).
- **`cron`** — same image as `app`, runs scheduled jobs. Shares hardening and app-env.
- **`setup`** — one-shot service running `db:sync` and `access:bootstrap`, then exits. `app` and `cron` depend on it completing successfully before starting.
- **`database` / `cache` / `queue`** — bundled backing services behind `profiles: [bundled]`. Start only when `COMPOSE_PROFILES` includes `bundled`. Each has a healthcheck that `depends_on` (with `required: false`) gates on.
- **`COMPOSE_PROJECT_NAME`** — required; namespaces all containers/volumes and selects `clients/<name>/.env` for both `${...}` substitution and `env_file:` injection.

## Relationships

- **`docker-compose.proxy.yml`** — the reverse proxy that sits in front of this stack. This file deliberately binds to `127.0.0.1` only, expecting that proxy to terminate TLS and publish the public interface.
- **`docker-compose.test.yml`** — the test-stack counterpart. Shares the same service topology and env-var names but targets a disposable environment rather than a per-client production one.
- **`asyncapi.yaml`** — the API/message contract the `app` and `cron` services implement; the production stack is the runtime that serves that contract.

## Notes

- **One deployment per client.** Never run one stack for multiple clients. `COMPOSE_PROJECT_NAME` is both the namespace key and the env-file selector; unset, nothing starts.
- **`.env` is read twice.** `--env-file` resolves `${...}` in this file; `env_file:` injects into the container. Both must point to the same `clients/<name>/.env` or every client silently shares config.
- **Bundled vs. managed services.** Flip between them by toggling `bundled` in `COMPOSE_PROFILES` and setting `NODE_DB_URI`/`NODE_REDIS_URL`/`NODE_RABBITMQ_URL` in the client env. `depends_on … required: false` (Compose ≥ 2.20) lets the app start without the bundled containers.
- **`clients/` is gitignored and in `.dockerignore`.** Secrets are mounted at runtime, never baked into the image.
- **Mongo TLS is self-signed.** `database` mints a CA at startup via `mongo-entrypoint.sh`; the public cert is shared into `mongo-ca-dir` and verified by the app's `tlsCAFile`. Do not remove the `:ro` mount without understanding this.
- **`/tmp` tmpfs is `noexec,nosuid` and 64 MB.** This bounds _concurrent_ uploads (each file lands here); single-upload size is controlled by `NODE_MAX_UPLOAD_BYTES`.
- **`setup` must not run the demo seeder.** `scenarios/apply.ts` refuses `NODE_ENV=production`; the production database starts empty.
- **OTLP collector is external.** `OTEL_EXPORTER_OTLP_ENDPOINT` is an env var with no default; no collector service is defined in this file.
