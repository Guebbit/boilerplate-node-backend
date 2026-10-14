---
source: docker-compose.production.yml
sha256: a125bda11a92b9fd51e58e64d61d12f690c32b5dfe714cb7ff71f4f3659d76cd
generated_at: 2026-10-14T06:46:06.188805+00:00
model: ollama:qwen3.8:27b
---

# docker-compose.production.yml

## Purpose

Deployment stack for the API, one instance per client organisation. Runs the production image (built by `docker/Dockerfile.production`) with no source mounts, no host-exposed database port, and no demo seeder. Its `setup` service initialises indexes and the shop row exactly once; the database otherwise starts empty and fills with real data.

## Key elements

- **`x-logging` anchor** — merged into every service; caps each container at 50 MB (10 m × 5 files) via the `json-file` driver (overridable to `k8s-file` for Podman).
- **`x-hardening` anchor** — merged into `app`, `cron`, `setup`: `read_only` filesystem, `cap_drop ALL`, `no-new-privileges`, `tmpfs /tmp` with `noexec,nosuid` and a 64 m size cap.
- **`x-data-hardening` anchor** — merged into `database`, `mongo-rs-init`, `cache`, `queue`: drops all capabilities then re-adds only `CHOWN`, `SETUID`, `SETGID`, `DAC_OVERRIDE`, `FOWNER`; does **not** set `read_only` (official data images need a writable root).
- **`COMPOSE_PROJECT_NAME`** — required; namespaces every container/network/volume and selects the client's config. Unset → nothing starts.
- **`profiles: [bundled]`** — `database`, `cache`, `queue` start only when `COMPOSE_PROFILES` includes `bundled`; remove it to point at managed backing services.
- **`profiles: [monitoring]`** — Prometheus, Alertmanager, node_exporter, Loki, Alloy. Off by default; no host ports published.
- **`setup` service** — runs `db:sync` + `access:bootstrap` once, then exits. `app` and `cron` depend on it finishing successfully before they start.
- **File secrets** — per-service credential files in `clients/<name>/secrets/`; compose refuses to start a service whose secret file is missing. Optional integration secrets remain in the client `.env`.
- **Dual env-file reference** — `--env-file` resolves `${...}` in this file; `env_file:` feeds the container. Both must point to the same client file.

## Relationships

- **`docker-compose.test.yml`** — sibling environment file for the same project; this file is the production counterpart (the dev counterpart is `docker-compose.yml`, referenced in the header comment).
- **`docker-compose.proxy.yml`** — sits in front of this stack as a reverse-proxy / TLS layer; this file exposes the app port on the compose network only, expecting the proxy to terminate external traffic.
- **`asyncapi.yaml`** — defines the event/API contract that the `app` and `queue` services implement; this file provides the `queue` (RabbitMQ) service that carries the async messages described there.

## Notes

- **One stack per client.** Never point two client env files at the same `COMPOSE_PROJECT_NAME`; the naming collision would merge volumes and break data isolation.
- **`scenarios/apply.ts` hard-refuses `NODE_ENV=production`.** A production database never receives demo rows — do not "help" by removing that guard.
- **Secret-file permissions:** create the directory `0700`, each file `0644`. Compose ignores `uid`/`mode` on a file secret; Redis (uid 999) and node (uid 1000) must both read it.
- **`clients/` is in `.dockerignore` and `.gitignore`.** Config and secrets are mounted at runtime, never baked into the image.
- **`required: false` on `depends_on`** for `app`/`cron`/`setup` is what lets them start when the bundled data services are absent (managed-services mode).
- **Monitoring has no Grafana** by design (~1 GB RAM). Point an external Grafana at the bundled Prometheus/Loki if needed.
- **Alertmanager with no `ALERT_*` receivers routes everything to `null`** — i.e. it notifies nobody. Set at least one receiver before relying on the monitoring profile.
