---
source: docker-compose.production.yml
sha256: 86e59315b7d100be78872aa4f9f3e2a168d45b77361328d70aef4474410847e5
generated_at: 2026-09-27T13:46:50.890938+00:00
model: ollama:qwen3.8:27b
---

# docker-compose.production.yml

## Purpose

Deployment stack for a single client's API instance. Unlike the development `docker-compose.yml`, it runs a pre-built image with no source mounts, no observability dashboards, and no demo seeder. Each client organisation gets its own stack, database, and domain, selected by `COMPOSE_PROJECT_NAME`.

## Key elements

- **`x-hardening` anchor** — shared container-hardening block (read-only root, `cap_drop: ALL`, `no-new-privileges`, `noexec` tmpfs at `/tmp`) merged into `app`, `cron`, and `setup`.
- **`x-app-env` anchor** — default `NODE_ENV=production`, `npm_config_cache` redirect to tmpfs, and default URIs for Mongo (TLS + replicaSet), Redis, and RabbitMQ that a client's env file can override to point at managed services.
- **`app`** — the HTTP service. Bound to `127.0.0.1` only (expects a reverse proxy in front). `restart: unless-stopped`, `stop_grace_period: 30s`. Named volumes for `uploads`, `storage` (mail spool / invoice cache), `quarantine`, and read-only `mongo-ca-dir`.
- **`cron`** — scheduler process running the same image as `app`; waits on `setup` before starting.
- **`setup`** — one-shot init service (`db:sync` + `access:bootstrap`); exits after completion. `app` and `cron` gate on it via `depends_on: condition: service_completed_successfully`.
- **`database` / `cache` / `queue`** — bundled backing services under `profiles: [bundled]`. Start only when `COMPOSE_PROFILES` includes `bundled`; otherwise the client points `NODE_DB_URI` / `NODE_REDIS_URL` / `NODE_RABBITMQ_URL` at managed instances. `depends_on` uses `required: false` so the app starts regardless.
- **`mongo-rs-init`** (implied by the replicaSet reference) — initialises a single-node replica set with a self-signed CA; the CA's public cert is shared into the `mongo-ca-dir` volume.

## Relationships

- **`docker-compose.proxy.yml`** — the reverse-proxy/TLS-terminating stack that sits in front of `app`'s loopback-bound port. This file deliberately does not expose the API on a public interface.
- **`docker-compose.test.yml`** — the test-environment counterpart; shares the same service topology but without production hardening or the one-client-per-stack model.
- **`asyncapi.yaml`** — the event/message contract for the RabbitMQ queue that `queue` (bundled) or a managed RabbitMQ instance serves; the `app` and `cron` services are the producers/consumers described there.

## Notes

- **`COMPOSE_PROJECT_NAME` is mandatory.** Unset, compose refuses to start (`:?` guard). It simultaneously namespaces containers/volumes and selects the `clients/<name>/.env` file.
- **Env file is read twice.** `--env-file` resolves `${...}` substitutions in this file; `env_file:` inside a service is what the container receives. Both must point at the same client path.
- **`clients/` is git-ignored and docker-ignored.** Secrets are mounted at runtime, never baked into the image.
- **Bundled vs. managed toggle.** Removing `bundled` from `COMPOSE_PROFILES` and setting the three URI variables in the client env file switches to external backing services. The `:?` guards on passwords live on the bundled service blocks, not in `x-app-env`, to avoid nested-default compose version issues.
- **No OTLP collector here.** `OTEL_EXPORTER_OTLP_ENDPOINT` is forwarded to the app, but the collector service is intentionally defined elsewhere.
- **One image, three containers.** `app` carries the `build:` directive and a shared `image:` tag; `cron` and `setup` reference that tag via `image:` alone, guaranteeing identical binaries.
- **Named volumes are not shared across hosts.** `uploads`, `storage`, and `quarantine` pin the deployment to one host. The durable path is an S3-compatible `ImageStore` adapter.
