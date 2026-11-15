---
source: docker-compose.proxy.yml
sha256: fe29f5342494484f1c7a754f51071dd933177ae373f7e0c6b2180c5c5a41f2f2
generated_at: 2026-11-14T17:10:04.195126+00:00
model: ollama:qwen3.8:27b
---

# docker-compose.proxy.yml

## Purpose

A Compose overlay that adds a shared Traefik reverse proxy (TLS-terminating, multi-client) in front of an existing client stack. Layered onto `docker-compose.production.yml` with a second `-f`, it changes only routing—no database, volume, or seeding is defined—so the base file remains untouched for single-stack deployments that use a standalone proxy instead.

## Key elements

- **`traefik` service** – Pinned image; file provider watching `/etc/traefik/dynamic`; entrypoints `:80` (redirect → HTTPS) and `:443`; ACME/HTTP-01 resolver using `${NODE_PROXY_ACME_EMAIL}`; Prometheus metrics on the internal `:8080`; explicit read/idle timeouts tuned against client `NODE_HTTP_*_TIMEOUT_MS` values.
- **`app` service override** – Joins both `default` (own DB/cache/queue) and `proxy` (shared) networks; sets a per-project alias `${COMPOSE_PROJECT_NAME}-app` so routes don't round-robin across clients; `ports: !reset []` removes the base file's loopback publish; defaults `NODE_TRUST_PROXY_HOPS` to `1`.
- **`prometheus` service override** – Joins the `proxy` network so it can scrape Traefik; mounts the Traefik scrape-job file read-only.
- **`networks`** – `default: {}` (explicit, for podman-compose 1.6 compat) and `proxy: external: true` (created once on the host outside any project).
- **`volumes`** – `traefik-acme` named volume for Let's Encrypt storage.

## Relationships

- **`docker-compose.production.yml`** – Base file; this overlay is passed after it (`-f production -f proxy`). Overrides `app` and `prometheus` services; adds the `traefik` service.
- **`traefik/dynamic`** – Directory mounted `:ro` into the `traefik` container as `/etc/traefik/dynamic`; holds one route YAML per client. Hot-reloaded on file change.
- **`traefik/client.example.yml`** – Template operators copy into `traefik/dynamic/<COMPOSE_PROJECT_NAME>.yml` to register a client's hostname.
- **`docker/observability/prometheus.traefik-scrape.yaml`** – Mounted into the `prometheus` container as a scrape job so its metrics include Traefik targets (cert expiry, request counts, etc.).

## Notes

- **Pre-requisites before first deploy**: `docker network create proxy` on the host; set `NODE_PROXY_ACME_EMAIL` in the client's `.env`; drop a route file into `traefik/dynamic/`.
- **Compose `networks:` replaces, not merges**, across files—hence `app` must name *both* `default` and `proxy` explicitly, or it silently loses its own database link.
- **The per-project alias is critical**: without it, the bare name `app` on the shared `proxy` network resolves to every client's container and round-robins traffic across them.
- **File provider over Docker socket** is a deliberate security choice (OWASP rule 1): the Docker socket exposes `Config.Env` for all containers; the file provider reads only route YAML from `traefik/dynamic/`. Never mount `clients/` (secrets) into Traefik.
- **`default: {}`** in the top-level `networks` block exists solely so podman-compose 1.6 can resolve the name; pure Docker Compose would auto-create it.
- **Timeout coupling**: `readTimeout` (135 s) must be ≥ every client's `NODE_HTTP_REQUEST_TIMEOUT_MS + NODE_HTTP_HEADERS_TIMEOUT_MS`; `idleConnTimeout` (4 s) must be < every client's `NODE_HTTP_KEEP_ALIVE_TIMEOUT_MS` to avoid 502s from stale sockets.
